// The whole loop with real input only (mouse clicks and drags, touchscreen
// taps and DevTools touch drags; the hook is only read, never used to act):
// title -> pick -> paint strokes -> change pot -> undo -> GO -> alive ->
// meadow -> sticker book, then a reload proves the friend and its painting
// were kept. Run at 1280x800 with a mouse and at 1024x768, 390x844 and
// 844x390 with touch (two fingers paint at once on the touch runs).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, goto, close, hook, touchDrag, mouseDrag, cdp } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

let server, browser;
before(async () => { server = await serve(process.env.MB_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);

const RUNS = [
  { name: '1280x800 mouse', width: 1280, height: 800, mode: 'mouse', kind: 'dragon' },
  { name: '1024x768 touch (tablet)', width: 1024, height: 768, mode: 'touch', kind: 'bunny', dpr: 2 },
  { name: '390x844 touch (phone portrait)', width: 390, height: 844, mode: 'touch', kind: 'whale', dpr: 2, mobile: true },
  { name: '844x390 touch (phone landscape)', width: 844, height: 390, mode: 'touch', kind: 'unicorn', dpr: 2, mobile: true },
];

async function stroke(page, mode, pts) {
  if (mode === 'touch') await touchDrag(page, pts, { stepMs: 8 });
  else await mouseDrag(page, pts, { steps: 2 });
}
// two fingers painting at once
async function twoFingers(page, a, b) {
  const s = await cdp(page);
  const tp = (i) => [{ x: a[i][0], y: a[i][1], id: 1 }, { x: b[i][0], y: b[i][1], id: 2 }];
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(0) });
  for (let i = 1; i < a.length; i++) { await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(i) }); await G.sleep(8); }
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

for (const R of RUNS) {
  test(`full loop with real input at ${R.name}`, async () => {
    const opts = { width: R.width, height: R.height, touch: R.mode === 'touch', mobile: !!R.mobile, dpr: R.dpr || 1 };
    const page = await open(browser, server.url, 'debug', opts);
    const mb = await hook(page);
    const st = () => mb('state');

    // title -> pick
    await G.waitReady(page, 'title');
    await G.tap(page, G.SEL.play, R.mode);
    await G.waitReady(page, 'pick');

    // pick a friend
    await G.tap(page, G.SEL.pick(R.kind), R.mode);
    await G.waitReady(page, 'paint');
    let s = await st();
    assert.equal(s.friend, R.kind);
    assert.equal(s.coverage, 0, 'a new painting starts blank');

    // paint a stroke across the outline
    const p = await G.pageRect(page);
    const rows = G.zigzag(p, 9);
    await stroke(page, R.mode, rows[4]);
    s = await st();
    const c1 = s.coverage;
    assert.ok(c1 > 0, `the stroke painted nothing (${JSON.stringify(s)})`);

    // change pot, paint, undo that stroke
    await G.tap(page, G.SEL.pot('blue'), R.mode);
    await G.sleep(50);
    s = await st();
    assert.equal(s.pot, 'blue');
    assert.equal(await page.locator(G.SEL.pot('blue')).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator(G.SEL.pot('red')).getAttribute('aria-pressed'), 'false');
    await stroke(page, R.mode, rows[2]);
    const c2 = (await st()).coverage;
    assert.ok(c2 > c1, `the blue stroke added nothing (${c1} -> ${c2})`);
    await G.tap(page, G.SEL.undo, R.mode);
    await G.sleep(50);
    const c3 = (await st()).coverage;
    assert.ok(Math.abs(c3 - c1) < 0.005, `undo should take back the blue stroke (${c1}, ${c2} -> ${c3})`);
    assert.equal((await st()).screen, 'paint');

    // more paint until the wand glows (two fingers at once on touch)
    await G.tap(page, G.SEL.pot('rainbow'), R.mode);
    if (R.mode === 'touch') { await twoFingers(page, rows[3], rows[6]); assert.ok((await st()).coverage > c3, 'two fingers painted nothing'); }
    for (const [i, r] of rows.entries()) {
      if ((await st()).goReady) break;
      if (i === 5) await G.tap(page, G.SEL.pot('glitter'), R.mode);
      await stroke(page, R.mode, r);
      await stroke(page, R.mode, r.map(([x, y]) => [x, y + p.h * 0.05]));
    }
    s = await st();
    assert.ok(s.goReady, `wand never got ready: coverage ${s.coverage}`);
    assert.ok(s.stars >= 1, `no stars at ${s.coverage}`);
    await G.sleep(1500);
    assert.equal((await st()).screen, 'paint', 'no auto-GO');

    // GO -> alive -> meadow
    await G.tap(page, G.SEL.go, R.mode);
    await G.waitScreen(page, 'alive', 3000);
    assert.equal((await st()).friend, R.kind, 'the friend that came alive is the one painted');
    await G.waitReady(page, 'meadow', 8000);
    s = await st();
    assert.equal(s.book, 1);
    assert.deepEqual(s.meadow.map((m) => m.kind), [R.kind]);

    // sticker book
    await G.tap(page, G.SEL.book, R.mode);
    await G.waitReady(page, 'book');
    assert.equal((await st()).book, 1);
    const label = await page.locator(G.SEL.slot(0)).getAttribute('aria-label');
    assert.equal(label, `Bring the ${R.kind} to the meadow`);
    await G.sleep(400);
    const portrait = await G.app(page, (app) => { const p = [...app.screens.book.portraits.values()][0]; return !!(p && p.actor && p.actor.rig); });
    assert.ok(portrait, 'the book shows a portrait of the friend');
    assert.deepEqual(await G.screens(page), ['title', 'pick', 'paint', 'alive', 'meadow', 'book']);
    clean(page);

    // reload: the friend and its painting persist
    const saved = await G.saved(page);
    await goto(page, server.url, 'debug');
    const mb2 = await hook(page);
    s = await mb2('state');
    assert.equal(s.screen, 'title');
    assert.equal(s.book, 1, 'the friend was not kept');
    assert.deepEqual((await G.saved(page)).friends.map((f) => f.id), saved.friends.map((f) => f.id));
    const keys = await G.idbKeys(page);
    assert.deepEqual(keys, saved.friends.map((f) => f.id), 'the painting was not stored');
    await G.waitReady(page, 'title');
    await G.tap(page, G.SEL.play, R.mode);
    await G.waitReady(page, 'meadow');
    await page.waitForFunction(() => window.__mb.app.screens.meadow.ents.every((e) => e.actor && e.tex), null, { timeout: 5000 });
    const m = await G.app(page, (app) => app.screens.meadow.ents.map((e) => ({ kind: e.kind, bitmap: typeof ImageBitmap !== 'undefined' && e.tex.canvas instanceof ImageBitmap })));
    assert.deepEqual(m, [{ kind: R.kind, bitmap: true }], 'the friend must wear its saved painting after a reload');
    clean(page);
    await close(page);
  });
}
