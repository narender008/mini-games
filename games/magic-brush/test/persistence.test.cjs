// Persistence: friends and doodles are kept on this device (IndexedDB) once,
// and come back out to play after a reload, with their own shapes and skins.
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

// what IndexedDB holds (records, not what the app thinks it holds)
const stored = () =>
  mb.ev(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('mini-games.magic-brush', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['friends', 'paintings'], 'readonly');
          const out = {};
          tx.objectStore('friends').getAll().onsuccess = (e) => (out.friends = e.target.result.map((r) => ({ id: r.id, kind: r.kind, skin: r.skin.length, portrait: (r.portrait || '').length, doodle: !!r.doodle })));
          tx.objectStore('paintings').count().onsuccess = (e) => (out.paintings = e.target.result);
          tx.oncomplete = () => {
            db.close();
            resolve(out);
          };
        };
      }),
  );

let kinds;
test('a painted friend and a doodle are each kept once', async () => {
  assert.ok(await mb.paintFriend('puppy'), 'puppy comes alive');
  await mb.step(2500);
  await mb.ev(() => window.__mb.mode('doodle'));
  await mb.ev(() => window.__mb.play());
  await mb.step(1600);
  assert.ok(await mb.doodle('face'), 'the face doodle comes alive');
  await mb.step(2500);
  // records are written once the skin picture is ready (and the portrait a moment later)
  await mb.until(() => (window.__mb.step(300), window.__mb.app.records.every((r) => r.skin && r.portrait)), null, 60000);
  let s;
  for (let i = 0; i < 40; i++) {
    s = await stored();
    if (s.friends.length >= 2 && s.friends.every((f) => f.skin > 1000)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(s.friends.length, 2, JSON.stringify(s.friends));
  assert.equal(new Set(s.friends.map((f) => f.id)).size, 2, 'no duplicate records');
  assert.ok(s.friends.every((f) => f.skin > 1000), 'skins kept');
  const doodle = s.friends.find((f) => f.doodle);
  assert.ok(doodle && doodle.kind.startsWith('doodle-'), 'the doodle keeps its drawing');
  kinds = s.friends.map((f) => f.kind).sort();
});

test('after a reload the friends and the doodle come back, once each', async () => {
  await mb.reload();
  assert.ok(await mb.until(() => window.__mb.friends().length >= 2, null, 180000), 'friends back out');
  await mb.step(500);
  const back = (await mb.friends()).map((f) => f.kind).sort();
  assert.deepEqual(back, kinds);
  const d = await mb.ev(() => {
    const e = window.__mb.app.friends.list.find((e) => e.friend.info.id.startsWith('doodle-'));
    const f = e.friend;
    return { skin: !!f.ownSkin, coarse: !!f.coarseGeo, tris: f.fineGeo.index.count / 3 };
  });
  assert.ok(d.skin, 'the doodle wears its painting');
  assert.ok(d.coarse && d.tris > 5000, 'the doodle is built again from its drawing');
  const s = await stored();
  assert.equal(s.friends.length, 2, 'nothing kept twice by the reload');
  assert.equal(await mb.ev(() => window.__mb.app.records.length), 2);
  // the shelf shows both
  await mb.settle();
  const shelf = await mb.ev(() => {
    document.querySelector('.menu-corner .shelf-btn').click();
    const el = document.getElementById('shelf');
    return { shown: !!el && !el.hidden, items: el ? el.querySelectorAll('img, canvas').length : 0 };
  });
  assert.ok(shelf.shown, 'the shelf opens');
  assert.ok(shelf.items >= 2, `friends on the shelf: ${shelf.items}`);
  assert.deepEqual(realErrors(mb.errors), []);
});
