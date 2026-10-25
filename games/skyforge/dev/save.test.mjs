// Node tests for the Skyforge saver with a fake localStorage.
//   node --test games/skyforge/dev/save.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaves, createSaver, wrapStorage, memoryStore, defaultSettings } from '../src/save/save.js';
import { VERSION, KEYS, checksum, parseSlot, migrate, migrationList, MIGRATIONS } from '../src/save/format.js';
import { fixture, fixtureData } from '../src/save/fixtures.js';
import { catchUp, catchupSeconds } from '../src/save/catchup.js';
import { createGame, restore, snapshot } from '../src/state.js';
import { initSim, hydrateSim, tick } from '../src/sim/index.js';
import { createBus } from '../src/core/events.js';
import { CFG } from '../src/config.js';

// A localStorage look-alike with an optional quota (bytes of key+value).
function fakeLocalStorage(quota = Infinity) {
  const m = new Map();
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      v = String(v);
      const old = m.get(k);
      if (size() - (old ? k.length + old.length : 0) + k.length + v.length > quota) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, v);
    },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    _m: m,
  };
}
const mk = (ls = fakeLocalStorage(), now = () => 1_800_000_000_000) => ({ ls, S: createSaves({ store: wrapStorage(ls), now }) });
const data1 = () => fixture(VERSION).data;

test('checksum is stable FNV-1a hex', () => {
  assert.equal(checksum({ a: 1 }), checksum({ a: 1 }));
  assert.notEqual(checksum({ a: 1 }), checksum({ a: 2 }));
  assert.match(checksum('x'), /^[0-9a-f]{8}$/);
});

test('write alternates A/B slots with rising seq, newest wins', () => {
  const { ls, S } = mk();
  const d = data1();
  const w1 = S.write(0, d); const w2 = S.write(0, { ...d, day: 7 }); const w3 = S.write(0, { ...d, day: 9 });
  assert.deepEqual([w1.slot, w2.slot, w3.slot], ['a', 'b', 'a']);
  assert.deepEqual([w1.seq, w2.seq, w3.seq], [1, 2, 3]);
  const r = S.inspect(0);
  assert.equal(r.ok, true); assert.equal(r.slot, 'a'); assert.equal(r.seq, 3); assert.equal(r.env.data.day, 9);
  const env = JSON.parse(ls.getItem(KEYS.slot(0, 'a')));
  assert.equal(env.v, VERSION); assert.equal(env.sum, checksum(env.data));
  for (const k of ['v', 'seq', 'sum', 'at', 'data']) assert.ok(k in env, k);
});

test('a fresh saver on the same storage continues the sequence', () => {
  const ls = fakeLocalStorage();
  const a = mk(ls).S; a.write(1, data1()); a.write(1, data1());
  const b = mk(ls).S; const w = b.write(1, data1());
  assert.equal(w.seq, 3); assert.equal(w.slot, 'a');
});

test('corrupted latest slot falls back to the older one', () => {
  for (const garbage of ['{not json', '"str"', 'null', '[]', '{"v":1}', JSON.stringify({ v: 1, seq: 99, sum: 'deadbeef', at: 1, data: { x: 1 } })]) {
    const { ls, S } = mk();
    S.write(0, { ...data1(), day: 3 });   // a
    S.write(0, { ...data1(), day: 4 });   // b (latest)
    ls.setItem(KEYS.slot(0, 'b'), garbage);
    const r = S.inspect(0);
    assert.equal(r.ok, true, garbage); assert.equal(r.slot, 'a'); assert.equal(r.env.data.day, 3); assert.equal(r.recovered, true);
    // the next write must not clobber the surviving good slot
    const w = S.write(0, { ...data1(), day: 5 });
    assert.equal(w.slot, 'b'); assert.ok(w.seq > S.inspect(0).seq - 1 && w.seq > 1);
    assert.equal(S.inspect(0).env.data.day, 5);
  }
});

test('valid-looking slot with a broken colony inside is treated as corrupt', () => {
  const { ls, S } = mk();
  S.write(0, { ...data1(), day: 3 });
  const bad = { t: 1 }; // passes checksum, fails validation
  ls.setItem(KEYS.slot(0, 'b'), JSON.stringify({ v: VERSION, seq: 50, sum: checksum(bad), at: 1, data: bad }));
  const r = S.inspect(0);
  assert.equal(r.ok, true); assert.equal(r.slot, 'a'); assert.equal(r.env.data.day, 3);
});

test('garbage in every key still yields a working list()', () => {
  const ls = fakeLocalStorage();
  const junk = ['', '{', 'undefined', '0', '{"v":"1"}', '{"v":-3,"seq":1}', JSON.stringify({ v: 1, seq: 'x' }), '\u0000￿'];
  let n = 0;
  for (let p = 0; p < 3; p++) for (const s of ['a', 'b']) ls.setItem(KEYS.slot(p, s), junk[n++ % junk.length]);
  ls.setItem(KEYS.settings, '{{{'); ls.setItem(KEYS.last, 'banana');
  const { S } = mk(ls);
  const L = S.list();
  assert.equal(L.length, 3);
  for (const row of L) { assert.equal(row.ok, false); assert.equal(row.exists, false); assert.equal(row.corrupt, true); }
  assert.deepEqual(S.getSettings(), defaultSettings());
  assert.equal(S.lastProfile(), 0);
  // and a game can still be saved into a garbage profile
  assert.equal(S.write(2, data1()).ok, true);
  assert.equal(S.list()[2].ok, true);
});

test('three profiles are independent', () => {
  const { S } = mk();
  S.write(0, { ...data1(), day: 2 }); S.write(1, { ...data1(), day: 5 });
  const L = S.list();
  assert.equal(L[0].day, 2); assert.equal(L[1].day, 5); assert.equal(L[2].exists, false);
  S.wipe(0);
  assert.equal(S.list()[0].exists, false); assert.equal(S.list()[1].day, 5);
});

test('list() summaries carry name, day, pop, chapter, coin, playtime, last saved', () => {
  const { S } = mk(undefined, () => 1_700_000_000_000);
  const d = data1(); d.colony.name = 'Brasshaven'; d.colony.pop = 41.6; d.colony.coin = 812.4; d.goals.chapter = 3; d.day = 12;
  S.write(0, d, { play: 3725 });
  const r = S.list()[0];
  assert.equal(r.name, 'Brasshaven'); assert.equal(r.pop, 42); assert.equal(r.coin, 812); assert.equal(r.chapter, 3);
  assert.equal(r.day, 12); assert.equal(r.playtime, 3725); assert.equal(r.at, 1_700_000_000_000);
});

test('a newer-version save is left untouched and reported', () => {
  const { ls, S } = mk();
  const future = JSON.stringify({ v: VERSION + 3, seq: 4, sum: 'whatever', at: 5, data: { new: 'shape' } });
  ls.setItem(KEYS.slot(1, 'a'), future);
  const row = S.list()[1];
  assert.equal(row.future, true); assert.match(row.message, /newer version/);
  const w = S.write(1, data1());
  assert.equal(w.ok, false); assert.equal(w.error, 'newer');
  assert.equal(ls.getItem(KEYS.slot(1, 'a')), future);
  assert.equal(ls.getItem(KEYS.slot(1, 'b')), null);
  assert.equal(S.importProfile(S.exportProfile(0) ?? '{}', 1).ok, false);
});

test('every migration step from fixture(v) reaches the current version', () => {
  assert.deepEqual(migrationList, [0]);
  for (const v of [...migrationList, VERSION]) {
    const f = fixture(v);
    assert.equal(f.v, v);
    assert.equal(parseSlot(JSON.stringify(f)).status, 'ok', `fixture v${v} parses`);
    const m = migrate(f);
    assert.equal(m.v, VERSION);
    assert.deepEqual(m.data, fixture(VERSION).data, `v${v} migrates to the current fixture`);
  }
  // and the saver loads a v0 slot
  const { ls, S } = mk();
  ls.setItem(KEYS.slot(0, 'b'), JSON.stringify(fixture(0, { seq: 3 })));
  const r = S.inspect(0);
  assert.equal(r.ok, true); assert.equal(r.migratedFrom, 0); assert.equal(r.env.data.difficulty, 'standard');
  assert.equal(S.write(0, r.env.data).slot, 'a');
});

test('migrated data restores into a running game', () => {
  const G = restore(migrate(fixture(0)).data, createBus());
  hydrateSim(G);
  for (let i = 0; i < 300; i++) tick(G);
  assert.ok(G.t > 0);
});

test('save then load reproduces the snapshot exactly (determinism)', () => {
  const G = createGame({ seed: 77 }); initSim(G);
  for (let i = 0; i < 600; i++) tick(G);
  const { S } = mk();
  S.write(0, snapshot(G));
  const G2 = restore(S.inspect(0).env.data); hydrateSim(G2);
  for (let i = 0; i < 600; i++) { tick(G); tick(G2); }
  assert.equal(JSON.stringify(snapshot(G2)), JSON.stringify(snapshot(G)));
});

test('export/import round trip with validation', () => {
  const { S } = mk();
  const d = data1(); d.colony.name = 'Exported Isle';
  S.write(0, d, { play: 99 });
  const str = S.exportProfile(0);
  const doc = JSON.parse(str);
  assert.equal(doc.game, 'skyforge'); assert.equal(doc.v, VERSION);
  const r = S.importProfile(str, 2);
  assert.equal(r.ok, true); assert.equal(S.list()[2].name, 'Exported Isle'); assert.equal(S.list()[2].playtime, 99);
  // a raw slot value and an old-version fixture import too
  assert.equal(S.importProfile(JSON.stringify(fixture(0)), 1).ok, true);
  assert.equal(S.list()[1].difficulty, 'standard');
  // rejections
  const bad = [
    ['', /could not be read/], ['hello', /could not be read/], ['[1]', /not a Skyforge/],
    [JSON.stringify({ ...doc, game: 'loomwake' }), /another game/],
    [JSON.stringify({ ...doc, v: VERSION + 1 }), /newer version/],
    [JSON.stringify({ ...doc, sum: '00000000' }), /damaged/],
    [JSON.stringify({ ...doc, data: { a: 1 }, sum: checksum({ a: 1 }) }), /incomplete/],
  ];
  for (const [s, re] of bad) { const x = S.importProfile(s, 2); assert.equal(x.ok, false); assert.match(x.error, re); }
  assert.equal(S.list()[2].name, 'Exported Isle', 'failed imports leave the profile alone');
});

test('quota failure keeps the previous save and reports', () => {
  const ls = fakeLocalStorage(Infinity);
  const { S } = mk(ls);
  const small = data1();
  S.write(0, small);
  const big = { ...small, log: Array.from({ length: 5000 }, (_, i) => ({ t: i, text: 'x'.repeat(40) })) };
  const ls2 = fakeLocalStorage(JSON.stringify(small).length * 2 + 2000);
  const S2 = createSaves({ store: wrapStorage(ls2) });
  assert.equal(S2.write(0, small).ok, true);
  const w = S2.write(0, big);
  assert.equal(w.ok, false); assert.equal(w.error, 'storage full');
  assert.equal(S2.inspect(0).ok, true);
});

test('settings persist, clamp and survive garbage', () => {
  const ls = fakeLocalStorage();
  const { S } = mk(ls);
  assert.deepEqual(S.getSettings(), defaultSettings());
  S.putSettings({ ...defaultSettings(), master: 7, music: -1, sfx: 0.5, ambience: 'loud', uiScale: 9, quality: 'ultra', colorBlind: true, edgePan: 'yes' });
  const s = S.getSettings();
  assert.equal(s.master, 1); assert.equal(s.music, 0); assert.equal(s.sfx, 0.5); assert.equal(s.ambience, defaultSettings().ambience);
  assert.equal(s.uiScale, 1.5); assert.equal(s.quality, 'auto'); assert.equal(s.colorBlind, true); assert.equal(s.edgePan, true);
  for (const k of ['master', 'music', 'sfx', 'ambience', 'quality', 'edgePan', 'colorBlind', 'reducedMotion', 'tooltips']) assert.ok(k in s, k);
});

// ---- the app saver ----
function fakeApp(flags = {}) {
  const ev = createBus();
  const app = { flags, ev, bus: createBus(), profile: 0, G: null, settings: {} };
  app.continueGame = (i) => {
    const d = app.saver.load(i); if (!d) return false;
    app.profile = i; app.G = restore(d, app.bus); hydrateSim(app.G);
    ev.emit('game', { G: app.G }); ev.emit('loaded', { G: app.G, away: d.awaySeconds, summary: d.awaySummary });
    return true;
  };
  app.save = (r) => app.saver.save(app.G, app.profile, r);
  return app;
}

test('createSaver: debug without save=1 never touches localStorage', () => {
  const ls = fakeLocalStorage();
  globalThis.localStorage = ls;
  try {
    const app = fakeApp({ debug: true, save: false });
    app.saver = createSaver(app);
    assert.equal(app.saver.persistent, false);
    app.G = createGame({ seed: 5 }); initSim(app.G);
    assert.equal(app.saver.save(app.G, 0, 'auto').ok, true);
    assert.equal(ls.length, 0);
    const app2 = fakeApp({ debug: true, save: true });
    app2.saver = createSaver(app2);
    assert.equal(app2.saver.persistent, true);
    app2.G = app.G; app2.saver.save(app2.G, 1, 'auto');
    assert.deepEqual(app2.saver.debug().keys(), ['skyforge.last', 'skyforge.p1.a']);
  } finally { delete globalThis.localStorage; }
});

test('createSaver: last profile, lastSave, debug hook surface', () => {
  const store = memoryStore();
  const app = fakeApp({ debug: true });
  app.saver = createSaver(app, { store });
  app.G = createGame({ seed: 9 }); initSim(app.G);
  app.profile = 2;
  const r = app.saver.save(app.G, 2, 'auto');
  assert.equal(r.ok, true);
  assert.deepEqual({ slot: app.saver.last.slot, seq: app.saver.last.seq }, { slot: 'a', seq: 1 });
  assert.equal(app.saver.keyFor(2), 'skyforge.p2.a');
  const app2 = fakeApp({ debug: true }); app2.saver = createSaver(app2, { store });
  assert.equal(app2.profile, 2, 'last profile restored');
  const h = app.saver.debug();
  assert.equal(h.version, VERSION); assert.deepEqual(h.migrations, [0]);
  assert.equal(h.now().ok, true);
  assert.deepEqual(h.read(), { ...h.read(), ok: true, slot: 'b', seq: 2, v: VERSION });
  const ex = h.export(); assert.equal(h.import(ex, 0).ok, true);
  assert.equal(typeof h.checksum, 'function');
  assert.equal(h.fixture(0).v, 0);
  h.wipe(); assert.deepEqual(h.keys(), []);
});

test('createSaver: settings.set merges, persists and emits', () => {
  const store = memoryStore();
  const app = fakeApp({});
  app.saver = createSaver(app, { store });
  let heard = null; app.ev.on('settings', (e) => { heard = e; });
  app.saver.settings.set({ music: 0.2, reducedMotion: true });
  assert.equal(app.settings.music, 0.2); assert.equal(app.settings.master, 0.8); assert.equal(app.settings.reducedMotion, true);
  assert.ok(heard);
  const again = createSaver(fakeApp({}), { store });
  assert.equal(again.settings.get().music, 0.2);
});

test('createSaver: play time resumes across loads', () => {
  let t = 0;
  const store = memoryStore();
  const app = fakeApp({});
  app.saver = createSaver(app, { store, realNow: () => t });
  app.G = createGame({ seed: 3 }); initSim(app.G);
  app.ev.emit('newgame', {});
  t = 90_000; app.saver.save(app.G, 0);
  assert.equal(app.saver.list()[0].playtime, 90);
  app.continueGame(0);
  t = 120_000; app.saver.save(app.G, 0);
  assert.equal(app.saver.list()[0].playtime, 120);
});

test('offline catch-up: rate, cap and summary', () => {
  const c = CFG.save.catchup;
  assert.equal(catchupSeconds(10), 0);
  assert.equal(catchupSeconds(3600), 3600 * c.rate);
  assert.equal(catchupSeconds(1e6), c.maxAway * c.rate);
  const d = fixtureData();
  const { data, summary } = catchUp(d, 3600);
  assert.ok(summary);
  assert.equal(summary.away, 3600);
  assert.ok(summary.simulated > 0);
  assert.ok(data.t > d.t, 'time moved on');
  assert.equal(data.t - d.t > summary.simulated - 1, true);
  assert.equal(catchUp(d, 30).summary, null);
});

test('offline catch-up respects the work budget', () => {
  const { summary } = catchUp(fixtureData(), 7200, { budgetMs: 1 });
  assert.ok(summary.ms < 200);
});

test('createSaver: load catches up after time away (outside debug) and emits away', async () => {
  let wall = 1_800_000_000_000;
  const store = memoryStore();
  const app = fakeApp({});
  app.saver = createSaver(app, { store, now: () => wall });
  app.G = createGame({ seed: 11 }); initSim(app.G);
  app.saver.save(app.G, 0);
  const t0 = app.G.t;
  wall += 3600 * 1000;
  let away = null; app.ev.on('away', (a) => { away = a; });
  app.continueGame(0);
  assert.ok(app.G.t > t0 + 100, 'colony ran on');
  assert.equal(Object.keys(app.G).includes('awaySeconds'), false, 'away info not copied into G');
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(away && away.summary && away.away === 3600);
  // debug: off by default, and __sf.save.away(s) forces it
  const app2 = fakeApp({ debug: true }); app2.saver = createSaver(app2, { store, now: () => wall + 3600e3 });
  app2.continueGame(0);
  assert.equal(app2.saver.away, null);
  const r = app2.saver.debug().away(1800);
  assert.equal(r.ok, true); assert.equal(r.away.summary.away, 1800);
});
