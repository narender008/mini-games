// Regressions of the old game's bugs (/mnt/project-files/magic-brush/evaluation.md)
// and the brief's must-fix lessons:
//  1. the friend that comes alive is the one picked, even with GO right after the pick
//  2/3. double taps and mashing on Play, GO, Home, paint-another, book, the book's
//     empty frame and a book friend make exactly one transition and never leave the game
//  4. no auto-GO, and no paint carried into a new painting
//  6. each painting is saved exactly once
//  -  GO on a blank or almost blank page only hints, it never starts the magic
//  5. resizing or rotating mid-alive and mid-transition re-lays out with no error
//  -  the save is capped at the newest 60 friends
//  8. tap targets are >= 56 CSS px on phones and >= 80 on tablets, inside the
//     window and not overlapping
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, mouseDrag } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

let server, browser;
before(async () => { server = await serve(process.env.MB_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);
const inGame = (page) => assert.ok(page.url().includes('/games/magic-brush/'), `left the game: ${page.url()}`);

// Taps one spot again and again: a double tap, then a child mashing it for
// about a second and a half, so the later taps land on the next screen.
const MASH_MS = [0, 60, 140, 220, 320, 450, 600, 800, 1050, 1350];
async function mash(page, x, y, mode) {
  const t0 = Date.now();
  for (const at of MASH_MS) {
    const wait = t0 + at - Date.now();
    if (wait > 0) await G.sleep(wait);
    await G.tapPoint(page, x, y, mode);
  }
}

async function start(query = 'debug', opts = {}) {
  const page = await open(browser, server.url, query, opts);
  const mb = await hook(page);
  return { page, mb };
}
// gets to a screen through the hook, then waits out its quiet time
async function at(page, mb, name, opts) { await mb('screen', name, opts); await G.waitReady(page, name); await G.resetScreens(page); }

// ------------------------------------------------------------------ 1
test('1. the friend that comes alive is the one picked, even with GO straight after the pick', async () => {
  const { page, mb } = await start();
  // a dragon painted and left on the easel
  await mb('pick', 'dragon');
  await mb('colourIn');
  // hook: pick and GO in the same tick
  const r = await page.evaluate(() => { const m = window.__mb; m.pick('kitten'); m.colourIn(); const ok = m.go(); return { ok, friend: m.state().friend }; });
  assert.ok(r.ok, 'GO refused');
  await G.waitScreen(page, 'alive', 2000);
  assert.equal((await mb('state')).friend, 'kitten');
  assert.deepEqual((await G.saved(page)).friends.map((f) => f.kind), ['kitten']);

  // real input: tap a bubble, then hammer the wand from the moment the easel shows
  await at(page, mb, 'pick');
  const go = await (async () => { await mb('pick', 'teddy'); const b = await G.box(page, G.SEL.go); return b; })();
  await at(page, mb, 'pick');
  await G.tap(page, G.SEL.pick('fox'), 'mouse');
  await G.waitScreen(page, 'paint', 3000);
  await mb('colourIn'); // the child's paint, put on at once
  for (let i = 0; i < 40 && (await mb('state')).screen === 'paint'; i++) { await G.tapPoint(page, go.cx, go.cy, 'mouse'); await G.sleep(40); }
  await G.waitScreen(page, 'alive', 3000);
  assert.equal((await mb('state')).friend, 'fox');
  await G.waitScreen(page, 'meadow', 8000);
  const st = await mb('state');
  assert.deepEqual((await G.saved(page)).friends.map((f) => f.kind), ['kitten', 'fox']);
  assert.ok(st.meadow.some((m) => m.kind === 'fox'));
  clean(page);
  await close(page);
});

// ------------------------------------------------------------------ 2, 3
const MASH = [
  { name: 'Play (first time)', from: 'title', sel: G.SEL.play, to: 'pick' },
  { name: 'Play (with friends)', from: 'title', sel: G.SEL.play, to: 'meadow', friends: 1 },
  { name: 'GO', from: 'paint', sel: G.SEL.go, to: 'alive', then: 'meadow', paint: true },
  { name: 'Home on pick', from: 'pick', sel: G.SEL.home, to: 'title' },
  { name: 'Home on the easel', from: 'paint', sel: G.SEL.home, to: 'title', paint: true },
  { name: 'Home in the meadow', from: 'meadow', sel: G.SEL.home, to: 'title', friends: 1 },
  { name: 'Home in the book', from: 'book', sel: G.SEL.home, to: 'title', friends: 1 },
  { name: 'paint-another in the meadow', from: 'meadow', sel: G.SEL.paint, to: 'pick', friends: 1 },
  { name: 'book in the meadow', from: 'meadow', sel: G.SEL.book, to: 'book', friends: 1 },
  { name: "the book's empty frame", from: 'book', sel: 'empty', to: 'pick', friends: 1 },
  { name: 'a friend in the book', from: 'book', sel: G.SEL.slot(0), to: 'meadow', friends: 2 },
];
for (const [mode, vp] of [['mouse', { width: 1280, height: 800 }], ['touch', { width: 390, height: 844, touch: true, mobile: true }], ['touch', { width: 844, height: 390, touch: true, mobile: true }]]) {
  test(`2/3. mashing every onward button makes exactly one transition (${mode} ${vp.width}x${vp.height})`, async () => {
    const { page, mb } = await start('debug', vp);
    const muted0 = await page.evaluate(() => localStorage.getItem('magic-brush:muted'));
    for (const M of MASH) {
      await mb('clearSave');
      for (let i = 0; i < (M.friends || 0); i++) await G.makeFriend(mb, i ? 'puppy' : 'bunny');
      const book0 = (await mb('state')).book;
      if (M.paint) { await mb('pick', 'turtle'); await mb('colourIn'); await G.waitReady(page, 'paint'); await G.resetScreens(page); } else await at(page, mb, M.from);
      const b = M.sel === 'empty'
        ? await G.box(page, `#ui [aria-label="Paint a new friend"]`)
        : await G.box(page, M.sel);
      await mash(page, b.cx, b.cy, mode);
      await G.sleep(200);
      if (M.then) await G.waitScreen(page, M.then, 8000);
      await G.sleep(450);
      const seen = await G.screens(page);
      const want = [M.from, M.to, ...(M.then ? [M.then] : [])];
      assert.deepEqual(seen, want, `${M.name}: screens went ${seen.join(' -> ')}`);
      inGame(page);
      const book1 = (await mb('state')).book;
      assert.equal(book1, book0 + (M.sel === G.SEL.go ? 1 : 0), `${M.name}: saved ${book1 - book0} friends`);
      if (M.to === 'pick') {
        // nothing chosen by a stray tap: still on pick after its own delay
        await G.sleep(400);
        assert.equal((await mb('state')).screen, 'pick', `${M.name}: a mashed tap picked a friend`);
      }
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('magic-brush:muted')), muted0, 'a mashed tap toggled the sound');
    clean(page);
    await close(page);
  });
}

// ------------------------------------------------------------------ 4
test('4. no auto-GO, and a new painting never carries paint over', async () => {
  const { page, mb } = await start();
  await at(page, mb, 'pick');
  await G.tap(page, G.SEL.pick('elephant'), 'mouse');
  await G.waitReady(page, 'paint');
  await mb('colourIn');
  let s = await mb('state');
  assert.equal(s.stars, 5);
  await G.sleep(3500);
  s = await mb('state');
  assert.equal(s.screen, 'paint', 'the friend came alive by itself');
  assert.equal(s.book, 0);

  // Home and back: a fresh page for the same friend
  await G.tap(page, G.SEL.home, 'mouse');
  await G.waitReady(page, 'title');
  await G.tap(page, G.SEL.play, 'mouse');
  await G.waitReady(page, 'pick');
  await G.tap(page, G.SEL.pick('elephant'), 'mouse');
  await G.waitReady(page, 'paint');
  s = await mb('state');
  assert.equal(s.coverage, 0, 'paint carried over through Home');
  assert.equal(await mb('undo'), false, 'there should be nothing to undo');

  // through GO, the meadow and paint-another: the same friend starts blank
  await mb('colourIn');
  await G.tap(page, G.SEL.go, 'mouse');
  await G.waitReady(page, 'meadow', 9000);
  await G.tap(page, G.SEL.paint, 'mouse');
  await G.waitReady(page, 'pick');
  await G.tap(page, G.SEL.pick('elephant'), 'mouse');
  await G.waitReady(page, 'paint');
  s = await mb('state');
  assert.equal(s.coverage, 0, 'paint carried over through the meadow');
  await G.sleep(2000);
  assert.equal((await mb('state')).screen, 'paint');
  // a blank page after a full one: nothing carried over either
  await mb('pick', 'blank');
  assert.equal((await mb('state')).coverage, 0);
  const px = await G.app(page, (app) => { const c = app.screens.paint.painting.canvas, g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; const first = d.slice(0, 4).join(); let diff = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d.slice(i, i + 4).join() !== first) diff++; return diff; });
  assert.ok(px < 40, `the blank page has paint on it (${px} differing samples)`);
  clean(page);
  await close(page);
});

// ------------------------------------------------------------------ 6
test('6. each painting is saved exactly once', async () => {
  const { page, mb } = await start();
  await mb('pick', 'puppy'); await mb('colourIn'); await G.waitReady(page, 'paint');
  const go = await G.box(page, G.SEL.go);
  // GO by tap and by keyboard (Enter on the focused wand) in the same breath
  await page.focus(G.SEL.go);
  await G.tapPoint(page, go.cx, go.cy, 'mouse');
  await page.keyboard.press('Enter');
  await mb('go');
  await G.waitScreen(page, 'meadow', 8000);
  let saved = await G.saved(page);
  assert.equal(saved.friends.length, 1, `saved ${saved.friends.length} times`);
  // sending it to the meadow from the book does not save it again
  await at(page, mb, 'book');
  await G.tap(page, G.SEL.slot(0), 'mouse');
  await G.waitReady(page, 'meadow');
  await G.sleep(1500);
  saved = await G.saved(page);
  assert.equal(saved.friends.length, 1);
  assert.equal(new Set(saved.roster).size, saved.roster.length, 'the meadow lists a friend twice');
  assert.equal((await mb('state')).meadow.length, 1);
  // three more friends, each once, with unique ids, and as many textures
  for (const k of ['fox', 'blank', 'whale']) await G.makeFriend(mb, k);
  await G.sleep(800);
  saved = await G.saved(page);
  assert.deepEqual(saved.friends.map((f) => f.kind), ['puppy', 'fox', 'blank', 'whale']);
  assert.equal(new Set(saved.friends.map((f) => f.id)).size, 4);
  assert.deepEqual((await G.idbKeys(page)).sort(), saved.friends.map((f) => f.id).sort());
  clean(page);
  await close(page);
});

// ------------------------------------------------------------------ GO on blank
test('GO on a blank or almost blank page wiggles and hints but never starts the magic', async () => {
  const { page, mb } = await start();
  for (const kind of ['dragon', 'blank']) {
    await at(page, mb, 'pick');
    await G.tap(page, G.SEL.pick(kind), 'mouse');
    await G.waitReady(page, 'paint');
    await G.resetScreens(page);
    const go = await G.box(page, G.SEL.go);
    // blank
    await G.tapPoint(page, go.cx, go.cy, 'mouse');
    await G.sleep(100);
    let hint = await G.app(page, (app) => ({ hint: !!app.screens.paint.hint, wiggle: app.screens.paint.goB.wiggle }));
    assert.ok(hint.hint && hint.wiggle > 0, `${kind}: no hint on a blank GO ${JSON.stringify(hint)}`);
    await G.sleep(1600);
    // a dab: almost blank
    const p = await G.pageRect(page);
    await mouseDrag(page, [[p.x + p.w * 0.5, p.y + p.h * 0.5], [p.x + p.w * 0.52, p.y + p.h * 0.51]]);
    const s = await mb('state');
    assert.ok(s.coverage < 0.04, `${kind}: the dab covered ${s.coverage}`);
    assert.equal(s.goReady, false);
    await G.tapPoint(page, go.cx, go.cy, 'mouse');
    await G.tapPoint(page, go.cx, go.cy, 'mouse');
    await G.sleep(100);
    hint = await G.app(page, (app) => !!app.screens.paint.hint);
    assert.ok(hint, `${kind}: no hint on an almost blank GO`);
    assert.equal(await mb('go'), false, 'the hook GO must refuse too');
    await G.sleep(1000);
    assert.deepEqual(await G.screens(page), ['paint'], `${kind}: the magic started`);
    assert.equal((await mb('state')).book, 0);
  }
  clean(page);
  await close(page);
});

// ------------------------------------------------------------------ 5
// the part of a button inside the window, as the smaller side in CSS px
// (hit areas may bleed a few px past the edge; what counts is what a finger can reach)
function onScreen(b, w, h) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (cx < 0 || cy < 0 || cx > w || cy > h) return 0;
  return Math.min(Math.min(b.x + b.w, w) - Math.max(b.x, 0), Math.min(b.y + b.h, h) - Math.max(b.y, 0));
}
async function checkLayout(page, label) {
  // wait two frames so the resize is applied
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const r = await page.evaluate(() => {
    const app = window.__mb.app, c = app.canvas, s = app.screen;
    const L = s.L, pg = L && L.page;
    return { iw: innerWidth, ih: innerHeight, W: app.W, H: app.H, cw: c.width, ch: c.height, dpr: app.dpr, sw: parseFloat(c.style.width), sh: parseFloat(c.style.height), page: pg ? { x: pg.x, y: pg.y, w: pg.w, h: pg.h } : null, screen: s.name };
  });
  assert.equal(r.W, r.iw, `${label}: app.W ${r.W} vs window ${r.iw}`);
  assert.equal(r.H, r.ih, `${label}: app.H`);
  assert.equal(r.sw, r.iw, `${label}: canvas css width`);
  assert.equal(r.sh, r.ih, `${label}: canvas css height`);
  assert.ok(Math.abs(r.cw - Math.round(r.iw * r.dpr)) <= 1 && Math.abs(r.ch - Math.round(r.ih * r.dpr)) <= 1, `${label}: canvas backing store ${r.cw}x${r.ch} for ${r.iw}x${r.ih}@${r.dpr}`);
  if (r.page) assert.ok(r.page.x >= -1 && r.page.y >= -1 && r.page.x + r.page.w <= r.iw + 1 && r.page.y + r.page.h <= r.ih + 1, `${label}: the page is off screen ${JSON.stringify(r.page)} in ${r.iw}x${r.ih}`);
  for (const b of await G.buttons(page)) assert.ok(onScreen(b, r.iw, r.ih) >= 40, `${label}: button ${b.id} off screen ${JSON.stringify(b)}`);
  return r;
}
test('5. resizing and rotating mid-transition, mid-alive and in the meadow re-lays out with no error', async () => {
  const { page, mb } = await start('debug', { width: 844, height: 390, touch: true, mobile: true, dpr: 2 });
  const sizes = [[390, 844], [844, 390], [1024, 768], [600, 600], [320, 568]];
  let n = 0;
  const flip = async (label) => { const [w, h] = sizes[n++ % sizes.length]; await page.setViewportSize({ width: w, height: h }); return checkLayout(page, `${label} at ${w}x${h}`); };
  await G.waitReady(page, 'title');
  // mid-transition title -> pick
  await G.tap(page, G.SEL.play, 'touch');
  await flip('title->pick transition');
  await G.waitReady(page, 'pick');
  await flip('pick');
  // pick -> paint transition, then paint
  await G.tap(page, G.SEL.pick('butterfly'), 'touch');
  await G.sleep(200);
  await flip('pick->paint');
  await G.waitReady(page, 'paint');
  await mb('colourIn');
  await flip('paint');
  // mid-alive, at several moments of the four seconds
  await G.tap(page, G.SEL.go, 'touch');
  await G.waitScreen(page, 'alive', 3000);
  for (const ms of [150, 500, 500, 600, 600]) { await G.sleep(ms); if ((await mb('state')).screen !== 'alive') break; await flip(`alive +${ms}`); }
  await G.waitScreen(page, 'meadow', 8000);
  await flip('meadow arrival');
  await G.sleep(300);
  await flip('meadow');
  // a bare-rotation burst: many sizes in a row inside one transition
  await G.waitReady(page, 'meadow');
  await G.tap(page, G.SEL.book, 'touch');
  for (let i = 0; i < 4; i++) { const [w, h] = sizes[i]; await page.setViewportSize({ width: w, height: h }); }
  await checkLayout(page, 'meadow->book burst');
  await G.waitReady(page, 'book');
  await page.setViewportSize({ width: 844, height: 390 });
  const r = await checkLayout(page, 'book');
  // backgrounds are re-baked once the size settles
  await G.sleep(500);
  const bg = await G.app(page, (app) => app.screen.bg && { W: app.screen.bg.W, H: app.screen.bg.H });
  assert.deepEqual(bg, { W: r.iw, H: r.ih }, 'the background was not re-baked for the new size');
  clean(page);
  await close(page);
});

// ------------------------------------------------------------------ save cap
test(`the save keeps only the newest ${G.SAVE_MAX} friends`, async () => {
  const { page, mb } = await start();
  const N = G.SAVE_MAX + 3;
  const ids = await page.evaluate(async (N) => {
    const m = window.__mb, kinds = ['dragon', 'unicorn', 'puppy', 'kitten', 'bunny', 'fox', 'elephant', 'turtle', 'whale', 'butterfly', 'penguin', 'teddy', 'blank'];
    m.freeze();
    const out = [];
    for (let i = 0; i < N; i++) {
      m.pick(kinds[i % kinds.length]);
      m.paint([[0.2, 0.45], [0.8, 0.45], [0.2, 0.55], [0.8, 0.55], [0.3, 0.65], [0.7, 0.65]], 'green');
      if (!m.go()) throw new Error(`GO refused at ${i}`);
      m.step(400);
      out.push(m.app.screens.alive.id);
      if (i % 10 === 9) await new Promise((r) => setTimeout(r, 30));
    }
    m.thaw();
    return out;
  }, N);
  assert.equal(new Set(ids).size, N);
  await G.sleep(1500);
  const saved = await G.saved(page);
  assert.equal(saved.friends.length, G.SAVE_MAX);
  assert.deepEqual(saved.friends.map((f) => f.id), ids.slice(N - G.SAVE_MAX), 'the newest 60 should be kept, in order');
  assert.ok(saved.roster.length <= G.MEADOW_MAX, `meadow roster ${saved.roster.length}`);
  const keys = await G.idbKeys(page);
  assert.ok(keys.length <= G.SAVE_MAX, `${keys.length} paintings stored`);
  for (const old of ids.slice(0, N - G.SAVE_MAX)) assert.ok(!keys.includes(old), `old painting ${old} still stored`);
  assert.equal((await mb('state')).book, G.SAVE_MAX);
  // the book pages through all of them
  await at(page, mb, 'book');
  const s = await mb('state');
  const per = await G.app(page, (app) => app.screens.book.perPage);
  assert.equal(s.pages, Math.ceil(G.SAVE_MAX / per));
  // paintings load lazily: only the page on screen has portraits
  await G.sleep(300);
  const portraits = await G.app(page, (app) => app.screens.book.portraits.size);
  assert.ok(portraits <= per, `${portraits} portraits built for a page of ${per}`);
  clean(page);
  await close(page);
});

// ------------------------------------------------------------------ 8
const PHONES = [[390, 844], [844, 390], [360, 640], [640, 360], [480, 320], [320, 480], [667, 375]];
const TABLETS = [[1024, 768], [768, 1024], [1180, 820], [820, 1180], [1366, 1024]];
for (const [kind, list, min] of [['phone', PHONES, 56], ['tablet', TABLETS, 80]]) {
  test(`8. tap targets are at least ${min} CSS px on every ${kind} screen, on screen and apart`, async () => {
    const { page, mb } = await start('debug', { width: list[0][0], height: list[0][1], touch: true, mobile: kind === 'phone', dpr: 2 });
    await G.makeFriend(mb, 'teddy');
    await G.makeFriend(mb, 'whale');
    const bad = [];
    for (const [w, h] of list) {
      await page.setViewportSize({ width: w, height: h });
      for (const name of ['title', 'pick', 'paint', 'meadow', 'book']) {
        if (name === 'paint') await mb('pick', 'dragon'); else await mb('screen', name);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const bs = await G.buttons(page);
        const rnd = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#ui .hit')].map((e) => [e.id, !e.classList.contains('rect')])));
        assert.ok(bs.length >= 3, `${name} at ${w}x${h}: only ${bs.length} buttons`);
        for (const b of bs) {
          const size = Math.min(b.w, b.h), vis = onScreen(b, w, h);
          if (size < min - 0.5) bad.push(`${name} ${w}x${h}: #${b.id} is ${size.toFixed(1)} px`);
          else if (vis < min - 0.5) bad.push(`${name} ${w}x${h}: only ${vis.toFixed(1)} px of #${b.id} is on screen ${JSON.stringify(b)}`);
        }
        for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i], b = bs[j];
          let hit;
          if (rnd[a.id] && rnd[b.id]) hit = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) < (a.w + b.w) / 2 - 2;
          else hit = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;
          if (hit) bad.push(`${name} ${w}x${h}: #${a.id} overlaps #${b.id}`);
        }
      }
    }
    assert.deepEqual(bad, []);
    clean(page);
    await close(page);
  });
}
