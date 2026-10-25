// The meadow: the six-friend cap (the oldest walks back to the book), all four
// toys by real taps and drags (bubbles to pop, a ball to flick, an apple to
// drag to a friend, the petting hand), tapping friends, the toys through the
// hook at a point, and the loop pausing while the tab is hidden.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, mouseDrag, touchDrag } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

let server, browser;
before(async () => { server = await serve(process.env.MB_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);
const SIX = ['dragon', 'puppy', 'bunny', 'whale', 'turtle', 'penguin'];

async function meadowWith(kinds, opts) {
  const page = await open(browser, server.url, 'debug&seed=3', opts);
  const mb = await hook(page);
  for (const k of kinds) await G.makeFriend(mb, k);
  await G.waitReady(page, 'meadow');
  await page.waitForFunction((n) => window.__mb.app.screens.meadow.ents.filter((e) => e.actor && e.actor.rig).length >= n, Math.min(kinds.length, 6), { timeout: 5000 });
  return { page, mb };
}
// a point on a friend that the meadow's own hit test accepts, in CSS px
const friendPoint = (page, i) => G.app(page, (app, i) => {
  const m = app.screens.meadow, e = m.ents[i], a = e.actor;
  for (let dy = 40; dy < 400; dy += 10) for (const dx of [0, -10, 10, -25, 25]) { const x = a.x + dx * a.s, y = a.y - dy * a.s; if (m.entAt(x, y) === e) return [x, y]; }
  return null;
}, i);

test('the meadow holds six friends; a seventh sends the oldest back to the book', async () => {
  const { page, mb } = await meadowWith(SIX);
  let s = await mb('state');
  assert.deepEqual(s.meadow.map((m) => m.kind).sort(), SIX.slice().sort());
  const first = (await G.saved(page)).roster[0];
  await G.makeFriend(mb, 'teddy');
  await G.waitReady(page, 'meadow');
  const saved = await G.saved(page);
  assert.equal(saved.roster.length, G.MEADOW_MAX);
  assert.ok(!saved.roster.includes(first), 'the oldest friend should leave the meadow');
  assert.equal(saved.friends.length, 7, 'the oldest friend stays in the book');
  s = await mb('state');
  const leaving = s.meadow.filter((m) => m.state === 'leave');
  assert.equal(leaving.length, 1, `one friend should walk off: ${JSON.stringify(s.meadow)}`);
  assert.equal(leaving[0].id, first);
  await page.waitForFunction(() => window.__mb.state().meadow.length === 6, null, { timeout: 12000 });
  s = await mb('state');
  assert.ok(s.meadow.some((m) => m.kind === 'teddy'));
  assert.ok(!s.meadow.some((m) => m.id === first));
  // bringing the oldest back from the book sends another one away
  await mb('screen', 'book');
  await G.waitReady(page, 'book');
  const label = `Bring the dragon to the meadow`;
  await G.tap(page, `#ui [aria-label="${label}"]`, 'mouse');
  await G.waitReady(page, 'meadow');
  assert.ok((await G.saved(page)).roster.includes(first));
  assert.equal((await G.saved(page)).roster.length, G.MEADOW_MAX);
  clean(page);
  await close(page);
});

for (const mode of ['mouse', 'touch']) {
  test(`all four toys and tapping friends with real ${mode} input`, async () => {
    const vp = mode === 'touch' ? { width: 1024, height: 768, touch: true } : { width: 1280, height: 800 };
    const { page, mb } = await meadowWith(['puppy', 'kitten', 'fox'], vp);
    const drag = (pts) => (mode === 'touch' ? touchDrag(page, pts, { stepMs: 16 }) : mouseDrag(page, pts, { steps: 2 }));
    const toys = async () => (await mb('state')).toys;
    const M = (fn, ...a) => G.app(page, fn, ...a);

    // tapping a friend: a giggle, then a trick on the second tap
    await page.waitForFunction(() => window.__mb.app.screens.meadow.ents.every((e) => e.state !== 'arrive'), null, { timeout: 8000 }).catch(() => {});
    await mb('freeze');
    const pt = await friendPoint(page, 0);
    assert.ok(pt, 'could not find a point on the friend');
    await mb('thaw');
    await G.tapPoint(page, pt[0], pt[1], mode);
    await G.sleep(120);
    let e0 = await M((app) => { const e = app.screens.meadow.ents[0]; return { taps: e.taps, giggle: e.actor.giggleT, trick: !!e.actor.trick, sleep: !!e.actor.sleep }; });
    assert.ok(e0.taps >= 1 || e0.giggle > 0, `the friend did not answer a tap: ${JSON.stringify(e0)}`);
    assert.ok(await mb('tapFriend', 1));
    assert.ok(await mb('tapFriend', 1));
    e0 = await M((app) => !!app.screens.meadow.ents[1].actor.trick || app.screens.meadow.ents[1].actor.giggleT > 0);
    assert.ok(e0, 'tapFriend did nothing');

    // bubbles: blow, some friends chase, pop one with a tap
    // (each friend joins in with a 70 % chance, so blow up to three times;
    // friends that catch up pop bubbles, so count them right after a blow)
    let chasing = 0, most = 0;
    for (let i = 0; i < 3 && !chasing; i++) {
      await G.tap(page, G.SEL.toy('bubbles'), mode);
      await G.sleep(100);
      most = Math.max(most, (await toys()).bubbles);
      await G.sleep(400);
      chasing = (await M((app) => app.screens.meadow.ents.filter((e) => e.state === 'chase').length));
    }
    assert.ok(most >= 8, `a blow should make bubbles (${most})`);
    assert.ok(chasing >= 1, 'no friend chases the bubbles');
    // pop one with a tap
    await G.tap(page, G.SEL.toy('bubbles'), mode);
    await G.sleep(450);
    await mb('freeze');
    const bub = await M((app) => { const b = app.screens.meadow.bubbles.find((b) => b.t > 0.2); return b && [b.x, b.y, app.screens.meadow.bubbles.length]; });
    assert.ok(bub, 'no bubble in the air to pop');
    await G.tapPoint(page, bub[0], bub[1], mode);
    const after = await M((app) => app.screens.meadow.bubbles.length);
    await mb('thaw');
    let t;
    assert.equal(after, bub[2] - 1, 'tapping a bubble should pop it');

    // ball: throw from the tray, then pick it up and flick it
    await G.tap(page, G.SEL.toy('ball'), mode);
    await G.sleep(1600);
    t = await toys();
    assert.ok(t.ball, 'no ball');
    await mb('freeze');
    const ball = await M((app) => { const b = app.screens.meadow.ball; return [b.x, b.y - b.z - b.r]; });
    await mb('thaw');
    await drag([ball, [ball[0] + 30, ball[1] - 10], [ball[0] + 90, ball[1] - 40], [ball[0] + 180, ball[1] - 90]]);
    const flick = await M((app) => { const b = app.screens.meadow.ball; return { held: !!b.held, vx: b.vx, vz: b.vz }; });
    assert.ok(!flick.held && Math.abs(flick.vx) > 50 && flick.vz > 120, `the ball was not flicked: ${JSON.stringify(flick)}`);

    // snack: an apple appears; drag it onto a friend and it is eaten
    await G.tap(page, G.SEL.toy('snack'), mode);
    await G.sleep(1500);
    assert.ok((await toys()).apple, 'no apple');
    await mb('freeze');
    const ap = await M((app) => { const a = app.screens.meadow.apple; return [a.x, a.y - a.z - a.r]; });
    const target = await friendPoint(page, 2);
    await mb('thaw');
    const path = [ap];
    for (let i = 1; i <= 8; i++) path.push([ap[0] + (target[0] - ap[0]) * i / 8, ap[1] + (target[1] - 30 - ap[1]) * i / 8]);
    await drag(path);
    await G.sleep(50);
    const fed = await M((app) => ({ apple: !!app.screens.meadow.apple, eating: app.screens.meadow.ents.filter((e) => e.state === 'eat').map((e) => e.kind) }));
    assert.ok(!fed.apple && fed.eating.length === 1, `the apple was not eaten: ${JSON.stringify(fed)}`);

    // petting hand: on, stroke a friend for hearts, off
    await G.tap(page, G.SEL.toy('pet'), mode);
    assert.ok((await toys()).pet);
    assert.equal(await page.locator(G.SEL.toy('pet')).getAttribute('aria-pressed'), 'true');
    await mb('freeze');
    const pp = await friendPoint(page, 0);
    await mb('thaw');
    await drag([pp, [pp[0] + 20, pp[1]], [pp[0] - 20, pp[1]], [pp[0] + 20, pp[1] + 5], [pp[0], pp[1]]]);
    const pet = await M((app) => app.screens.meadow.ents.map((e) => e.state));
    assert.ok(pet.includes('petted'), `no friend was petted: ${pet}`);
    await G.sleep(300);
    await G.tap(page, G.SEL.toy('pet'), mode);
    assert.equal((await toys()).pet, false);

    // the toys through the hook at a point
    for (const name of G.TOYS) assert.ok(await mb('toy', name, 600, 600) !== false || name === 'pet', `toy(${name}) failed`);
    assert.equal((await mb('state')).screen, 'meadow');
    clean(page);
    await close(page);
  });
}

test('the loop pauses while the tab is hidden and resumes after', async () => {
  const { page, mb } = await meadowWith(['bunny']);
  await G.tap(page, G.SEL.toy('bubbles'), 'mouse'); // also starts the AudioContext
  const hide = (h) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, h);
  const probe = () => page.evaluate(async () => { const a = await import('./src/audio.js'); const c = a.audioContext(); return { t: window.__mb.app.t, audio: c && c.state }; });
  await hide(true);
  await G.sleep(100);
  const a = await probe();
  await G.sleep(800);
  const b = await probe();
  assert.equal(b.t, a.t, 'the sim kept running while hidden');
  assert.equal(b.audio, 'suspended', 'sound should be suspended while hidden');
  // no frames drawn while hidden
  const frames = await page.evaluate(() => new Promise((r) => { let n = 0; const c = window.__mb.app.canvas, g0 = c.getContext('2d'); const d = g0.drawImage; g0.drawImage = function (...x) { n++; return d.apply(this, x); }; setTimeout(() => { g0.drawImage = d; r(n); }, 500); }));
  assert.equal(frames, 0, `drew ${frames} images while hidden`);
  await hide(false);
  await G.sleep(500);
  const c = await probe();
  assert.ok(c.t > b.t + 0.2, 'the sim did not resume');
  assert.equal(c.audio, 'running');
  clean(page);
  await close(page);
});
