// Doodle mode: whatever is drawn puffs up into a 3D friend of its own shape,
// comes alive off the canvas and plays in the garden with the others; an
// almost empty drawing gets a gentle hint. Then the garden's extra life: the
// lawn blooms, the pond ripples, an audience gathers, fireworks, a gift.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open, realErrors } = require('./helpers.cjs');

let mb;
before(async () => {
  mb = await open({ query: '&mode=doodle' });
});
after(async () => {
  await mb?.close();
});

test('?mode=doodle lights the Doodle card and paints with the big kid tools', async () => {
  assert.equal(await mb.ev(() => window.__mb.doodleOn()), true);
  assert.equal((await mb.state()).mode, 'big');
  const lit = await mb.ev(() => document.querySelector('.mode[aria-checked="true"]').dataset.mode);
  assert.equal(lit, 'doodle');
  assert.deepEqual(await mb.ev(() => window.__mb.doodlePresets()), ['blob', 'star', 'snake', 'two-blobs', 'tiny', 'face', 'stick']);
});

test('a blank canvas or a tiny speck gets a hint, not a friend', async () => {
  await mb.ev(() => {
    window.__mb.play();
    window.__mb.app.newCanvas();
    window.__mb.step(1600);
  });
  await mb.settle();
  await mb.ev(() => window.__mb.tap('go'));
  assert.ok(await mb.until(() => window.__mb.state().state === 'paint' && !window.__mb.app.doodle.busy, null, 30000));
  await mb.doodle('tiny', { go: false });
  await mb.settle();
  await mb.ev(() => window.__mb.tap('go'));
  assert.ok(await mb.until(() => window.__mb.state().state === 'paint' && !window.__mb.app.doodle.busy, null, 30000));
  const r = await mb.ev(() => ({ s: window.__mb.state(), hint: document.getElementById('toolbar').classList.contains('doodle-hint'), friends: window.__mb.friends().length }));
  assert.equal(r.s.magic, null);
  assert.equal(r.hint, true, 'the paint pots bounce');
  assert.ok(r.s.strokes > 0, 'the speck is still there to add to');
  assert.equal(r.friends, 0);
});

test('a doodle never comes alive by itself', async () => {
  await mb.doodle('blob', { go: false });
  await mb.step(3000);
  const s = await mb.state();
  assert.equal(s.magic, null);
  assert.equal(s.state, 'paint');
});

for (const preset of ['star', 'snake', 'two-blobs']) {
  test(`a ${preset} doodle comes alive as itself`, async () => {
    const before = (await mb.friends()).length;
    // (a double tap on GO makes one friend, not two)
    await mb.ev((p) => window.__mb.doodle(p), preset);
    await mb.step(100);
    await mb.settle();
    await mb.ev(() => {
      window.__mb.tap('go');
      window.__mb.tap('go');
    });
    assert.ok(await mb.comeAlive(), 'comes alive');
    const info = await mb.ev(() => window.__mb.doodleInfo());
    assert.match(info.id, /^doodle-/);
    assert.ok(info.tris > 5000 && info.tris < 40000, `${preset}: ${info.tris} triangles (budget 40k)`);
    assert.ok(info.coarse > 0 && info.coarse < info.tris / 2, `a coarse body for far away (${info.coarse})`);
    const list = await mb.friends();
    assert.equal(list.length, before + 1, 'one new friend');
    assert.ok(list.some((f) => f.kind === info.id));
    console.log(`# ${preset}: ${info.tris} triangles, coarse ${info.coarse}, aspect ${info.stats.aspect.toFixed(2)}`);
    await mb.step(2500);
    await mb.ev(() => window.__mb.play());
    await mb.step(1600);
  });
}

test('doodles play in the garden with the other friends, with their coarse body far away', async () => {
  await mb.ev(async () => {
    window.__mb.garden();
    window.__mb.step(200);
    await window.__mb.pose('kitten', 0.5, -1.2, 0.4);
  });
  await mb.step(2500);
  const lod = await mb.ev(() => window.__mb.lod());
  assert.equal(lod.length, 4);
  const doodles = lod.filter((l) => l.kind.startsWith('doodle-'));
  assert.equal(doodles.length, 3);
  assert.ok(doodles.every((d) => d.ready), 'every doodle has a coarse body');
  // from far off, a doodle swaps to its coarse body
  const far = await mb.ev(() => {
    const mb = window.__mb;
    const e = mb.app.friends.list.find((e) => e.friend.info.id.startsWith('doodle-'));
    const p = e.friend.object.position;
    mb.view([p.x, p.y + 4, p.z + 14], [p.x, p.y, p.z], 40);
    mb.step(16);
    return e.friend.body.geometry === e.friend.coarseGeo;
  });
  assert.equal(far, true);
  await mb.ev(() => window.__mb.garden());
  await mb.step(2000);
});

test('tapping the lawn blooms flowers, the pond ripples', async () => {
  const r = await mb.ev(() => {
    const mb = window.__mb;
    mb.life.bloom();
    mb.life.pond();
    mb.step(400);
    return { blooms: mb.life.state().blooms, rings: mb.app.life.pond.rings.count };
  });
  assert.ok(r.blooms >= 1, `blooms ${r.blooms}`);
  assert.ok(r.rings > 0, 'ripples drawn (the idle-pool trim lets them through)');
});

test('an audience gathers and cheers; paint fireworks', async () => {
  await mb.ev(() => window.__mb.life.audience());
  for (let i = 0; i < 8; i++) {
    const done = await mb.ev(() => {
      window.__mb.step(700);
      const a = window.__mb.life.state().audience;
      return a && a.length >= 3 && a.every((s) => s.arrived);
    });
    if (done) break;
  }
  const a = (await mb.ev(() => window.__mb.life.state())).audience;
  assert.ok(a && a.length >= 3, `audience ${JSON.stringify(a)}`);
  await mb.ev(() => window.__mb.life.fireworks());
  await mb.step(500);
  assert.ok((await mb.ev(() => window.__mb.life.state())).rockets > 0, 'fireworks');
  await mb.step(6000);
});

test('a friend offers a gift flower', async () => {
  let started = false;
  // (a debug audience with no newcomer to cheer stays up to 25 s)
  for (let i = 0; i < 24 && !started; i++) {
    started = await mb.ev(() => window.__mb.life.gift());
    if (!started) await mb.step(1500);
  }
  const dbg = await mb.ev(() => ({ life: window.__mb.life.state(), list: window.__mb.app.friends.list.map((e) => ({ k: e.friend.info.id, home: e.home, st: e.state, busy: e.busy, trick: e.friend.trick?.name, emo: !!e.friend.emoting })), walkers: window.__mb.app.friends.walkers().length }));
  assert.ok(started, 'someone is free to give a gift ' + JSON.stringify(dbg));
  let phase = null;
  // (the friend walks up first, then holds the flower out)
  for (let i = 0; i < 60; i++) {
    phase = await mb.ev(() => {
      window.__mb.step(400);
      return window.__mb.life.state().gift;
    });
    if (phase === 'offer') break;
  }
  assert.equal(phase, 'offer');
  await mb.ev(() => window.__mb.life.giveGift());
  await mb.step(1500);
  assert.deepEqual(realErrors(mb.errors), []);
});
