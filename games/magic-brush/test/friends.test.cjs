// Every friend (the twelve and the blank page's doodle buddy) goes the whole
// way: easel -> paint -> GO -> alive -> meadow, without errors. The friend
// that comes alive and walks into the meadow is that kind, it wears the
// child's painting (its rig is cut from the painted texture, not a default
// one), and its painting is stored. The come-alive moment runs on the frozen
// sim clock, so the thirteen take seconds, not a minute.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

let server, browser;
before(async () => { server = await serve(process.env.MB_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);

const ALL = [...G.KINDS, 'blank'];

test('every friend and the doodle buddy complete paint -> alive -> meadow', async () => {
  const page = await open(browser, server.url, 'debug');
  const mb = await hook(page);
  const ids = [];
  for (const kind of ALL) {
    await mb('freeze');
    await mb('pick', kind);
    let s = await mb('state');
    assert.equal(s.friend, kind);
    assert.equal(s.coverage, 0, `${kind}: page not blank`);
    // a red stroke, then colour in with the child's colours
    await mb('paint', [[0.3, 0.5], [0.7, 0.5]], 'red');
    const cov = await mb('colourIn', ['blue', 'yellow', 'pink']);
    s = await mb('state');
    assert.ok(cov >= 0.8 && s.stars >= 4 && s.goReady, `${kind}: colour-in reached only ${cov} (${s.stars} stars)`);
    assert.equal(await mb('go'), true, `${kind}: GO refused`);
    await mb('step', 400);
    s = await mb('state');
    assert.equal(s.screen, 'alive', `${kind}: did not come alive`);
    assert.equal(s.friend, kind);
    // through the magic, sampling a few moments
    for (const ms of [800, 800, 800, 800, 900]) await mb('step', ms);
    await mb('step', 900);
    s = await mb('state');
    assert.equal(s.screen, 'meadow', `${kind}: did not reach the meadow`);
    await mb('thaw');
    const id = await G.app(page, (app) => app.screens.alive.id);
    ids.push(id);
    await page.waitForFunction((id) => window.__mb.app.screens.meadow.ents.some((e) => e.id === id && e.actor && e.actor.rig), id, { timeout: 5000 });
    const info = await G.app(page, (app, id) => {
      const e = app.screens.meadow.ents.find((x) => x.id === id);
      return { kind: e.kind, state: e.state, parts: e.actor.rig && (e.actor.rig.parts ? e.actor.rig.parts.length : Object.keys(e.actor.rig).length), primed: !!e.tex && !!e.tex.canvas, w: e.tex.canvas.width };
    }, id);
    assert.equal(info.kind, kind);
    assert.equal(info.state, 'arrive', `${kind}: should walk in`);
    assert.ok(info.primed && info.w > 0, `${kind}: no painted texture`);
    // it wears the painting: the texture is the one cut at GO, not a default one
    const same = await G.app(page, (app, id) => { const e = app.screens.meadow.ents.find((x) => x.id === id); return e.tex === app.screens.alive.prep.tex; }, id);
    assert.ok(same, `${kind}: the meadow friend does not wear the painted texture`);
    await G.sleep(250);
    const fs = await frameStats(page);
    assert.ok(fs.std > 8, `${kind}: meadow frame looks blank`);
    clean(page);
  }
  await G.sleep(1000);
  const saved = await G.saved(page);
  assert.deepEqual(saved.friends.map((f) => f.kind), ALL);
  assert.deepEqual(saved.friends.map((f) => f.id), ids);
  const keys = await G.idbKeys(page);
  assert.deepEqual(keys.slice().sort(), ids.slice().sort(), 'every painting is stored');
  // the meadow keeps the newest six
  assert.deepEqual(saved.roster, ids.slice(-G.MEADOW_MAX));
  // and the book shows them all, with portraits for the page on screen
  await mb('screen', 'book');
  await G.waitReady(page, 'book');
  await page.waitForFunction(() => { const b = window.__mb.app.screens.book; return [...b.portraits.values()].filter((p) => p.actor).length >= b.perPage; }, null, { timeout: 5000 });
  clean(page);
  await close(page);
});

test('the doodle buddy is made from the painted shape', async () => {
  const page = await open(browser, server.url, 'debug');
  const mb = await hook(page);
  await mb('pick', 'blank');
  // a tall thin shape on the left
  for (let u = 0.2; u <= 0.3; u += 0.02) await mb('paint', [[u, 0.15], [u, 0.85]], 'green');
  assert.equal(await mb('go'), true);
  await G.waitScreen(page, 'alive', 2000);
  const d = await G.app(page, (app) => { const a = app.screens.alive; return { box: a.def.box, doodle: !!a.def.doodle, eyes: a.prep.eyes, kind: a.actor.kind }; });
  assert.ok(d.doodle, 'not a doodle def');
  assert.equal(d.kind, 'doodle');
  assert.ok(d.box.h > d.box.w * 1.5, `the doodle should be tall like the painting: ${JSON.stringify(d.box)}`);
  assert.ok(d.eyes && d.eyes.color, 'no eyes');
  await G.waitScreen(page, 'meadow', 8000);
  clean(page);
  await close(page);
});
