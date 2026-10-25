// Smoke tests: every screen loads clean (no console errors or warnings, page
// errors, unhandled rejections or failed requests), nothing leaves localhost,
// three.js is gone, every button has an id and a label, and the switches
// ?screen=, ?pick=, ?cover and ?mute do what they say.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

let server, browser;
before(async () => { server = await serve(process.env.MB_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);

test('title loads clean, draws a detailed frame and makes no outside or three.js requests', async () => {
  const page = await open(browser, server.url);
  await G.sleep(1500);
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'title');
  const s = await frameStats(page);
  assert.ok(s.std > 10 && s.colours > 60, `title looks blank or flat: ${JSON.stringify(s)}`);
  const local = page.requests.filter((u) => !u.startsWith(server.url) && !u.startsWith('data:') && !u.startsWith('blob:'));
  assert.deepEqual(local, [], 'requests left localhost');
  const three = page.requests.filter((u) => /three|vendor\//i.test(u));
  assert.deepEqual(three, [], 'three.js or a vendored library was requested');
  assert.equal(await page.evaluate(() => typeof window.THREE), 'undefined');
  assert.equal(await page.evaluate(() => document.querySelectorAll('script[type=importmap]').length), 0, 'an import map is left in index.html');
  const back = await page.locator(G.SEL.games).getAttribute('href');
  assert.equal(back, '../../index.html');
  clean(page);
  await close(page);
});

test('every module the game loads is a relative, local file', async () => {
  const page = await open(browser, server.url, 'debug');
  await G.sleep(500);
  const js = page.requests.filter((u) => u.endsWith('.js'));
  assert.ok(js.length >= 10, `expected the game's modules, got ${js.length}`);
  for (const u of js) assert.ok(u.startsWith(`${server.url}/games/magic-brush/src/`), `module from outside the game: ${u}`);
  clean(page);
  await close(page);
});

for (const name of G.SCREENS) {
  for (const extra of ['', '&cover', '&mute']) {
    test(`?screen=${name}${extra} loads clean`, async () => {
      const page = await open(browser, server.url, `debug&screen=${name}${extra}`);
      const mb = await hook(page);
      await G.sleep(name === 'alive' ? 500 : 600);
      const st = await mb('state');
      assert.equal(st.screen, name);
      assert.equal(await page.evaluate(() => document.body.dataset.screen), name);
      const s = await frameStats(page);
      assert.ok(s.std > 8 && s.colours > 30, `${name} looks blank: ${JSON.stringify(s)}`);
      const ui = await page.evaluate(() => getComputedStyle(document.getElementById('ui')).display);
      if (extra === '&cover') assert.equal(ui, 'none', '?cover should hide the buttons');
      else assert.notEqual(ui, 'none');
      if (extra === '&mute') assert.equal(await page.evaluate(() => import('./src/audio.js').then((a) => a.isMuted())), true, '?mute should mute');
      // every button has a unique id and a label
      const bs = await G.buttons(page);
      const ids = bs.map((b) => b.id);
      assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids}`);
      for (const b of bs) { assert.ok(b.id, 'button without id'); assert.ok(b.label && b.label.length > 1, `button ${b.id} has no aria-label`); }
      if (name === 'alive') await G.waitScreen(page, 'meadow', 8000);
      clean(page);
      await close(page);
    });
  }
}

test('?pick= opens the easel with that friend; ?screen=alive comes alive and walks to the meadow', async () => {
  for (const k of ['whale', 'blank']) {
    const page = await open(browser, server.url, `debug&pick=${k}`);
    const mb = await hook(page);
    const st = await mb('state');
    assert.equal(st.screen, 'paint');
    assert.equal(st.friend, k);
    assert.equal(st.coverage, 0);
    clean(page);
    await close(page);
  }
  const page = await open(browser, server.url, 'debug&screen=alive&pick=penguin');
  const mb = await hook(page);
  assert.equal((await mb('state')).friend, 'penguin');
  await G.waitScreen(page, 'meadow', 8000);
  const st = await mb('state');
  assert.ok(st.meadow.some((m) => m.kind === 'penguin'), JSON.stringify(st.meadow));
  clean(page);
  await close(page);
});

test('the sound button toggles, is remembered, and the AudioContext runs after a tap', async () => {
  const page = await open(browser, server.url, 'debug');
  const mb = await hook(page);
  await G.waitReady(page, 'title');
  await G.tap(page, G.SEL.sound, 'mouse');
  const lab = await page.locator(G.SEL.sound).getAttribute('aria-label');
  assert.equal(lab, 'Sound off');
  assert.equal(await page.evaluate(() => localStorage.getItem('magic-brush:muted')), '1');
  await G.sleep(300);
  await G.tap(page, G.SEL.sound, 'mouse');
  assert.equal(await page.locator(G.SEL.sound).getAttribute('aria-label'), 'Sound on');
  const state = await page.evaluate(async () => { const a = await import('./src/audio.js'); const c = a.audioContext(); return c && c.state; });
  assert.equal(state, 'running');
  assert.equal((await mb('state')).screen, 'title', 'the sound button must not leave the title');
  clean(page);
  await close(page);
});

test('a page without ?debug exposes no hook', async () => {
  const page = await open(browser, server.url);
  await G.sleep(300);
  assert.equal(await page.evaluate(() => typeof window.__mb), 'undefined');
  clean(page);
  await close(page);
});
