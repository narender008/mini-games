// Little ones, the whole loop: pick a friend, colour in its bold dotted
// outline, GO, and it comes alive and plays in the garden. Three friends
// (a furry one, a sky one and a sculpted one), then every garden toy.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open, realErrors } = require('./helpers.cjs');

let mb;
before(async () => {
  mb = await open({ query: '&mode=little' });
});
after(async () => {
  await mb?.close();
});

test('the dotted outline is bold enough for small children', async () => {
  await mb.ev(() => window.__mb.play());
  await mb.ev(() => window.__mb.pickTap('bunny'));
  assert.ok(await mb.until(() => window.__mb.state().canvasFriend === 'bunny' && window.__mb.state().subjectReady));
  // dots of the outline drawing (red channel of the line texture): count them and measure one
  const dots = await mb.ev(() => {
    const o = window.__mb.app.outline;
    const c = o.lineCanvas;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let red = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 128) red++;
    return { red, px: c.width * c.height, k: c.width / 1024 };
  });
  // at least 1% of the painting covered by dots (thin pale dots were about a third of that)
  console.log(`# outline dot cover ${(dots.red / dots.px).toFixed(4)}`);
  assert.ok(dots.red / dots.px > 0.01, `outline dot cover ${(dots.red / dots.px).toFixed(4)}`);
});

for (const [id, why] of [
  ['bunny', 'furry'],
  ['sun', 'lives in the sky'],
  ['dragon', 'a sculpted pal'],
]) {
  test(`${id} (${why}) comes alive and joins the garden`, async () => {
    assert.ok(await mb.paintFriend(id), `${id} in the garden`);
    await mb.step(2500);
    const s = await mb.state();
    assert.equal(s.state, 'play');
    assert.equal(s.strokes, 0, 'the canvas is fresh again');
  });
}

test('three friends play in the garden, the furry one with its fur', async () => {
  await mb.ev(() => window.__mb.garden());
  await mb.step(2500);
  const list = await mb.friends();
  assert.deepEqual(list.map((f) => f.kind).sort(), ['bunny', 'dragon', 'sun']);
  const lod = await mb.ev(() => window.__mb.lod());
  const bunny = lod.find((l) => l.kind === 'bunny');
  assert.ok(bunny.shells, 'the bunny has fur shells');
  assert.ok(bunny.shown >= 3, `fur shells drawn: ${bunny.shown}`);
  // the sun keeps to the sky
  const sun = await mb.ev(() => window.__mb.app.friends.list.find((e) => e.friend.info.id === 'sun').friend.object.position.y);
  assert.ok(sun > 0.5, `the sun is up in the sky (${sun.toFixed(2)} m)`);
});

test('every toy works', async () => {
  const r = await mb.ev(() => {
    const T = window.__mb.toys;
    const out = {};
    const press = (k) => document.querySelector(`.toy[data-toy="${k}"]`).click();
    press('bubbles');
    window.__mb.step(900);
    out.bubbles = T.bubbles.b.length + T.bubbles.stream;
    press('ball');
    window.__mb.step(300);
    out.ball = T.ball.exists;
    press('snack');
    window.__mb.step(300);
    out.snack = T.snack.list.length;
    press('call');
    window.__mb.step(300);
    out.call = !!T.call.run;
    press('pet');
    out.pet = T.toy;
    return out;
  });
  assert.ok(r.bubbles > 0, 'bubbles blown');
  assert.ok(r.ball, 'ball dropped');
  assert.ok(r.snack > 0, 'treat given');
  assert.ok(r.call, 'everybody called');
  assert.equal(r.pet, 'pet');
  await mb.step(2000);
});

test('a tapped friend does a trick', async () => {
  await mb.step(4000);
  const r = await mb.ev(() => {
    const L = window.__mb.app.friends.list;
    const i = L.findIndex((e) => !e.friend.trick && e.state !== 'journey' && e.state !== 'hello');
    window.__mb.trick(null, i);
    return { i, trick: L[i]?.friend.trick?.name ?? null, state: L[i]?.state };
  });
  assert.ok(r.i >= 0 && r.trick && r.state === 'trick', JSON.stringify(r));
  await mb.step(3000);
  assert.deepEqual(realErrors(mb.errors), []);
});
