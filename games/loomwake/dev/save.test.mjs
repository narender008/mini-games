// Unit tests for src/save/save.js. Run: node games/loomwake/dev/save.test.mjs
import assert from 'node:assert/strict';
import {
  VERSION, KEYS, checksum, createSaves, memoryStore, wrapStorage, fixture, migrate, migrationList,
  freshMeta, parseSlot, saveApi, defaultSettings,
} from '../src/save/save.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`ok   ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n     ${e && e.stack || e}`); }
}

// A fake window.localStorage (the Storage interface).
function fakeLocalStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    _m: m,
  };
}
let clock = 1000;
const now = () => ++clock;
const mk = (ls = fakeLocalStorage()) => ({ ls, saves: createSaves({ store: wrapStorage(ls), now }) });
const sampleRun = () => ({ v: 3, seed: 99, rng: { run: 1, ai: 2, combat: 3 }, region: 'glasswood', regionIndex: 0, chamber: 2, depth: 2, hp: 70, maxHp: 100, boons: [{ id: 'x', rarity: 'rare', level: 2 }] });

test('fresh profile loads empty without throwing', () => {
  const { saves } = mk();
  const r = saves.load(0);
  assert.equal(r.empty, true); assert.equal(r.ok, false); assert.equal(r.run, null);
  assert.deepEqual(r.meta.currency, { lumen: 0, keys: 0, shards: 0 });
});

test('round trip meta and run', () => {
  const { ls, saves } = mk();
  const meta = freshMeta(5); meta.currency.lumen = 42; meta.seen['a.b'] = 2;
  const w = saves.write(0, meta, sampleRun());
  assert.equal(w.ok, true); assert.equal(w.slot, 'a'); assert.equal(w.seq, 1);
  const again = createSaves({ store: wrapStorage(ls), now });
  const r = again.load(0);
  assert.equal(r.ok, true); assert.equal(r.seq, 1); assert.equal(r.meta.currency.lumen, 42);
  assert.deepEqual(r.run, sampleRun()); assert.equal(r.meta.seen['a.b'], 2);
});

test('writes alternate A and B with rising seq; newest wins', () => {
  const { ls, saves } = mk();
  const m = freshMeta();
  for (let i = 1; i <= 5; i++) { m.currency.lumen = i; const w = saves.write(1, m, null); assert.equal(w.seq, i); assert.equal(w.slot, i % 2 ? 'a' : 'b'); }
  const r = createSaves({ store: wrapStorage(ls), now }).load(1);
  assert.equal(r.seq, 5); assert.equal(r.slot, 'a'); assert.equal(r.meta.currency.lumen, 5);
});

test('corrupt A falls back to B', () => {
  const { ls, saves } = mk();
  const m = freshMeta();
  m.currency.lumen = 1; saves.write(0, m); // a seq1
  m.currency.lumen = 2; saves.write(0, m); // b seq2
  m.currency.lumen = 3; saves.write(0, m); // a seq3
  ls.setItem(KEYS.slot(0, 'a'), '{"v":3,"seq":3,"sum":"oops", trunc');
  const s2 = createSaves({ store: wrapStorage(ls), now });
  const r = s2.load(0);
  assert.equal(r.ok, true); assert.equal(r.slot, 'b'); assert.equal(r.meta.currency.lumen, 2); assert.equal(r.recovered, true);
  // the next write must not overwrite the good B
  const w = s2.write(0, r.meta, null);
  assert.equal(w.slot, 'a'); assert.ok(w.seq > 2);
  assert.equal(parseSlot(ls.getItem(KEYS.slot(0, 'b'))).status, 'ok');
});

test('checksum mismatch rejected', () => {
  const { ls, saves } = mk();
  const m = freshMeta(); m.currency.lumen = 7; saves.write(0, m);
  const a = JSON.parse(ls.getItem(KEYS.slot(0, 'a')));
  a.meta.currency.lumen = 99999; // tampered, sum unchanged
  ls.setItem(KEYS.slot(0, 'a'), JSON.stringify(a));
  assert.equal(parseSlot(ls.getItem(KEYS.slot(0, 'a'))).status, 'corrupt');
  const r = createSaves({ store: wrapStorage(ls), now }).load(0);
  assert.equal(r.ok, false); assert.equal(r.meta.currency.lumen, 0); assert.equal(r.recovered, true);
});

test('both slots corrupt gives a fresh, writable profile', () => {
  const ls = fakeLocalStorage();
  ls.setItem(KEYS.slot(2, 'a'), 'garbage');
  ls.setItem(KEYS.slot(2, 'b'), '{"v":3,"seq":9,"sum":"00000000","meta":{},"run":null}');
  const s = createSaves({ store: wrapStorage(ls), now });
  const r = s.load(2);
  assert.equal(r.ok, false); assert.equal(r.empty, true); assert.equal(r.recovered, true); assert.ok(r.message);
  const w = s.write(2, freshMeta());
  assert.equal(w.ok, true); assert.ok(w.seq > 9);
  assert.equal(createSaves({ store: wrapStorage(ls), now }).load(2).ok, true);
});

test('every kind of junk in every key never throws', () => {
  const junk = ['', 'null', '[]', '1', '"str"', '{', '{"v":"3"}', '{"v":-1}', '{"v":3}', '{"v":3,"seq":1,"meta":null}', '\u0000\u0001', 'undefined', '{"v":1.5,"seq":1}', JSON.stringify({ v: 2, seq: 1, sum: 'x', meta: { a: 1 } })];
  for (const j of junk) {
    const ls = fakeLocalStorage();
    for (let p = 0; p < 3; p++) for (const s of ['a', 'b']) ls.setItem(KEYS.slot(p, s), j);
    ls.setItem(KEYS.settings, j); ls.setItem(KEYS.lastProfile, j);
    const s = createSaves({ store: wrapStorage(ls), now });
    const rows = s.profiles();
    assert.equal(rows.length, 3);
    assert.ok(typeof s.loadSettings().volume.master === 'number');
    assert.ok(s.lastProfile() >= 0);
  }
});

test('a broken localStorage (throws on access) still loads', () => {
  const bad = { get length() { throw new Error('x'); }, key() { throw new Error('x'); }, getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
  const s = createSaves({ store: wrapStorage(bad), now });
  assert.equal(s.load(0).ok, false);
  assert.equal(s.write(0, freshMeta()).ok, false);
  assert.deepEqual(s.keys(), []);
  assert.equal(s.loadSettings().v, 1);
});

test('future version is left untouched and profile is read-only', () => {
  const ls = fakeLocalStorage();
  const future = JSON.stringify({ v: VERSION + 4, seq: 3, sum: 'whatever', at: 1, meta: { newThing: true }, run: null, extra: [1, 2] });
  ls.setItem(KEYS.slot(0, 'a'), future);
  const s = createSaves({ store: wrapStorage(ls), now });
  const r = s.load(0);
  assert.equal(r.readOnly, true); assert.match(r.message, /newer version/);
  const w = s.write(0, freshMeta());
  assert.equal(w.ok, false); assert.equal(w.readOnly, true);
  assert.equal(ls.getItem(KEYS.slot(0, 'a')), future);
  assert.equal(ls.getItem(KEYS.slot(0, 'b')), null);
  assert.equal(s.importProfile(0, s.exportProfile(1)).ok, false);
  assert.equal(ls.getItem(KEYS.slot(0, 'a')), future);
  // other profiles unaffected
  assert.equal(s.write(1, freshMeta()).ok, true);
  assert.equal(s.profiles()[0].readOnly, true);
});

test('migration list and each fixture migrates to current', () => {
  assert.deepEqual(migrationList, [1, 2]);
  for (const v of [1, 2, 3]) {
    const f = fixture(v);
    assert.equal(f.v, v);
    assert.equal(parseSlot(JSON.stringify(f)).status, 'ok', `fixture v${v} parses`);
    const m = migrate(f);
    assert.equal(m.v, VERSION);
    assert.ok(m.meta.currency && m.meta.stats && m.meta.unlocks && Array.isArray(m.meta.unlocks.weapons));
    assert.ok(m.meta.seen && typeof m.meta.seen === 'object' && !Array.isArray(m.meta.seen));
  }
  const m1 = migrate(fixture(1));
  assert.equal(m1.meta.currency.lumen, 120); assert.equal(m1.meta.stats.runs, 4); assert.equal(m1.meta.seen['sable.firstDeath'], 1);
  assert.deepEqual(m1.meta.unlocks.weapons, ['blade', 'spear']);
  assert.equal(m1.run.region, 'choir'); assert.equal(m1.run.chamber, 3); assert.equal(m1.run.rng.run, 987654321);
  assert.equal(m1.run.boons[0].id, 'solenne.attack'); assert.equal(m1.run.boons[0].level, 1);
  const m2 = migrate(fixture(2));
  assert.equal(m2.meta.currency.shards, 5); assert.equal(m2.meta.tapestry.vigor, 2); assert.equal(m2.meta.flags.reveal1, true);
  assert.equal(m2.run.region, 'forge'); assert.equal(m2.run.regionIndex, 2); assert.equal(m2.run.boons[0].rarity, 'rare');
});

test('old fixture in storage loads (migrated) and next write is current v', () => {
  for (const v of [1, 2]) {
    const ls = fakeLocalStorage();
    ls.setItem(KEYS.slot(0, 'b'), JSON.stringify(fixture(v, { seq: 4 })));
    const s = createSaves({ store: wrapStorage(ls), now });
    const r = s.load(0);
    assert.equal(r.ok, true); assert.equal(r.v, v); assert.equal(r.migratedFrom, v);
    const w = s.write(0, r.meta, r.run);
    assert.equal(w.slot, 'a'); assert.equal(w.seq, 5);
    const back = createSaves({ store: wrapStorage(ls), now }).load(0);
    assert.equal(back.v, VERSION); assert.equal(back.seq, 5);
    assert.deepEqual(back.meta, r.meta);
  }
});

test('three profiles are independent', () => {
  const { ls, saves } = mk();
  for (let p = 0; p < 3; p++) { const m = freshMeta(); m.currency.lumen = (p + 1) * 10; saves.write(p, m, p === 1 ? sampleRun() : null); }
  saves.write(1, saves.load(1).meta, null);
  saves.wipe(2);
  const s = createSaves({ store: wrapStorage(ls), now });
  assert.equal(s.load(0).meta.currency.lumen, 10);
  assert.equal(s.load(1).meta.currency.lumen, 20); assert.equal(s.load(1).run, null); assert.equal(s.load(1).seq, 2);
  assert.equal(s.load(2).empty, true);
  const rows = s.profiles();
  assert.deepEqual(rows.map((r) => r.lumen), [10, 20, 0]);
  assert.deepEqual(rows.map((r) => r.empty), [false, false, true]);
});

test('export, wipe, import restores everything', () => {
  const { ls, saves } = mk();
  const m = freshMeta(); m.currency = { lumen: 333, keys: 4, shards: 9 }; m.memories = ['m1', 'm2']; m.affinity.orrin = 5;
  saves.write(0, m, sampleRun());
  const str = saves.exportProfile(0);
  const doc = JSON.parse(str);
  assert.equal(doc.game, 'loomwake'); assert.equal(doc.v, VERSION); assert.equal(doc.sum, checksum({ meta: doc.meta, run: doc.run }));
  saves.wipe();
  assert.deepEqual(saves.keys(), []);
  const r = saves.importProfile(0, str);
  assert.equal(r.ok, true, r.error);
  const back = createSaves({ store: wrapStorage(ls), now }).load(0);
  assert.deepEqual(back.meta, m); assert.deepEqual(back.run, sampleRun());
  // import into another profile works too
  assert.equal(saves.importProfile(2, str).ok, true);
  assert.equal(saves.load(2).meta.currency.lumen, 333);
});

test('import rejects bad files', () => {
  const { saves } = mk();
  saves.write(0, freshMeta());
  const good = JSON.parse(saves.exportProfile(0));
  const cases = ['not json', '[]', JSON.stringify({ ...good, sum: 'deadbeef' }), JSON.stringify({ ...good, game: 'other' }), JSON.stringify({ ...good, v: 99 }), JSON.stringify({ ...good, meta: null })];
  for (const c of cases) { const r = saves.importProfile(1, c); assert.equal(r.ok, false); assert.ok(r.error); }
  assert.equal(saves.load(1).empty, true);
  // an old-version export (fixture shape plus game tag) imports and migrates
  const old = { game: 'loomwake', ...fixture(1) };
  const r = saves.importProfile(1, JSON.stringify(old));
  assert.equal(r.ok, true, r.error); assert.equal(saves.load(1).meta.currency.lumen, 120);
});

test('settings separate and survive corrupt game saves', () => {
  const { ls, saves } = mk();
  const st = defaultSettings(); st.volume.music = 0.1; st.shake = 0;
  saves.saveSettings(st); saves.setLastProfile(2);
  for (let p = 0; p < 3; p++) for (const s of ['a', 'b']) ls.setItem(KEYS.slot(p, s), 'junk');
  const s2 = createSaves({ store: wrapStorage(ls), now });
  assert.equal(s2.loadSettings().volume.music, 0.1); assert.equal(s2.loadSettings().shake, 0);
  assert.equal(s2.lastProfile(), 2);
  saves.wipe(0);
  assert.equal(createSaves({ store: wrapStorage(ls), now }).loadSettings().volume.music, 0.1);
});

test('memory store keeps nothing in localStorage', () => {
  const s = createSaves({ store: memoryStore(), now });
  s.write(0, freshMeta());
  assert.equal(s.store.kind, 'memory'); assert.deepEqual(s.keys(), ['loomwake.p0.a']);
});

test('saveApi shape', () => {
  const { saves } = mk();
  const G = { profile: 0, saves, flow: { checkpoint: () => saves.write(0, freshMeta()), snapshot: () => ({ meta: freshMeta(), run: null }), reloadProfile: () => {} } };
  const api = saveApi(G);
  for (const k of ['keys', 'now', 'read', 'export', 'import', 'fixture', 'checksum', 'wipe']) assert.equal(typeof api[k], 'function', k);
  assert.equal(api.version, VERSION); assert.deepEqual(api.migrations, [1, 2]);
  assert.equal(api.now().ok, true);
  assert.deepEqual(api.keys(), ['loomwake.p0.a']);
  const rd = api.read(); assert.equal(rd.ok, true); assert.equal(rd.seq, 1); assert.equal(rd.slot, 'a'); assert.equal(rd.v, VERSION);
  const ex = api.export();
  api.wipe(); assert.deepEqual(api.keys(), []);
  assert.equal(api.import(ex).ok, true);
  assert.equal(api.read().ok, true);
  assert.equal(api.checksum({ a: 1 }), checksum({ a: 1 }));
  assert.equal(api.fixture(2).v, 2);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
