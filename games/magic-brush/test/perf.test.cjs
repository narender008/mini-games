// Performance budgets as ceilings on what a frame draws (triangles and draw
// calls from __mb.stats(), all passes together). Frame times mean nothing in
// software GL, but a frame's triangles are the same on any machine, and they
// are what made the original game stutter on tablets.
//   start screen < 300k triangles (smoke.test.cjs checks it too)
//   the garden with six friends (four furry) < 500k
//   one doodle friend < 40k (doodle.test.cjs checks each preset)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open, realErrors } = require('./helpers.cjs');

let mb;
before(async () => {
  mb = await open();
});
after(async () => {
  await mb?.close();
});

const report = (name, st) => console.log(`# ${name}: ${st.tris} triangles, ${st.calls} draw calls`);

test('start screen: under 300k triangles', async () => {
  await mb.step(500);
  const st = await mb.stats();
  report('start screen', st);
  assert.ok(st.tris < 300000, `${st.tris}`);
});

test('easel: under 300k triangles', async () => {
  await mb.ev(() => {
    window.__mb.play();
    window.__mb.step(2000);
  });
  const st = await mb.stats();
  report('easel', st);
  assert.ok(st.tris < 300000, `${st.tris}`);
});

test('the garden with six friends: under 500k triangles', async () => {
  await mb.ev(async () => {
    const mb = window.__mb;
    mb.garden();
    mb.step(200);
    const spots = [
      ['bunny', -0.7, -0.6],
      ['kitten', 0.6, -0.4],
      ['puppy', -0.2, -1.5],
      ['teddy', 0.9, -1.6],
      ['dragon', -1.2, -2.1],
      ['unicorn', 0.3, -2.4],
    ];
    await Promise.all(spots.map(([id, x, z], i) => mb.pose(id, x, z, i)));
  });
  // (each friend's coarse body is meshed in the worker a moment after it is built)
  await mb.until(() => window.__mb.lod().every((l) => l.ready), null, 120000);
  await mb.step(3000);
  await mb.step(500);
  const lod = await mb.ev(() => window.__mb.lod());
  assert.equal(lod.length, 6);
  const st = await mb.stats();
  report('garden, six friends', st);
  assert.ok(st.tris < 500000, `${st.tris}`);
  assert.ok(st.calls < 600, `${st.calls} draw calls`);
});

test('the garden with six friends and three toys out: under 550k triangles', async () => {
  await mb.ev(() => {
    for (const k of ['bubbles', 'ball', 'snack']) document.querySelector(`.toy[data-toy="${k}"]`).click();
    window.__mb.step(1500);
  });
  const st = await mb.stats();
  report('garden, six friends, toys', st);
  assert.ok(st.tris < 550000, `${st.tris}`);
});

test('one doodle friend: under 40k triangles', async () => {
  await mb.ev(() => window.__mb.mode('doodle'));
  await mb.ev(() => window.__mb.play());
  await mb.step(1600);
  assert.ok(await mb.doodle('blob'));
  const info = await mb.ev(() => window.__mb.doodleInfo());
  console.log(`# doodle (blob): ${info.tris} triangles, coarse ${info.coarse}`);
  assert.ok(info.tris < 40000, `${info.tris}`);
  assert.deepEqual(realErrors(mb.errors), []);
});
