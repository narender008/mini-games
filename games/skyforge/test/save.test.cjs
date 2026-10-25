// The save system: autosave on its interval and on pagehide, close and reopen
// restores the same colony, three independent profiles, a corrupt newest slot
// falls back to the older one, garbage in every key still gives a working
// title, every migration step from save.fixture(v), a future version left
// alone, export/import through the hook and through the Settings buttons, and
// nothing written under plain ?debug.
//
// Key layout comes from save.keys() (lib/game.cjs keys()).
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, clean, assert, B, G } = require('./lib/suite.cjs');
const env = suite();
const { sleep, SEL } = G;

const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

// Plays a colony forward a little so a save has something in it: a couple of
// buildings, a research started, ten minutes of colony time.
async function progress(page, sf, seed = 4242, profile = 0) {
  const s = await G.freshColony(page, sf, { seed, profile });
  const c = await sf('content');
  const home = G.homeIsland(s);
  let built = 0;
  for (const b of c.buildings) {
    if (built >= 3) break;
    if ((await G.buildAt(sf, b.id, home)).ok) built++;
  }
  assert.ok(built >= 1, 'could not build anything in a fresh colony');
  const st = await sf('state');
  if (st.research.available.length) await sf('research', st.research.available[0]);
  await G.stepUntil(page, 's => false', { ms: 600000, chunk: 5000 });
  return sf('state');
}

async function continueColony(page, sf, profile = 0) {
  let s = await G.waitScene(sf, ['title', 'profiles', 'colony'], 8000);
  for (let i = 0; i < 4 && s.scene !== 'colony'; i++) {
    if (s.scene === 'title') {
      const prof = await G.firstVisible(page, [SEL.profile(profile)]);
      if (prof) await prof.click(); else await G.clickOr(page, [SEL.continue]);
    } else if (s.scene === 'profiles') await G.clickOr(page, [SEL.profile(profile)]);
    await sleep(500);
    s = await sf('state');
  }
  return G.waitScene(sf, 'colony', 10000);
}

test('autosave writes on its own and seq grows', async () => {
  const { page, sf } = await env.debug();
  await progress(page, sf, 11);
  const a = await sf('save.read');
  assert.ok(a && a.ok, `no valid save after ten colony minutes: ${JSON.stringify(a)}`);
  await G.stepUntil(page, 's => false', { ms: 600000, chunk: 5000 });
  const b = await sf('save.read');
  assert.ok(b.seq > a.seq, `no new autosave in ten more minutes (seq ${a.seq} -> ${b.seq})`);
  const e = await G.saveEntries(page);
  assert.ok(Object.keys(e).length >= 1, 'nothing in localStorage under the save prefix');
  clean(page);
  await B.close(page);
});

test('closing the tab and coming back restores the same colony', async () => {
  const { page, sf } = await env.debug();
  await progress(page, sf, 5151);
  const before = G.colonyFingerprint(await sf('state'));
  const ctx = page.context();
  await G.closeTab(page); // pagehide save
  const { page: p2, sf: sf2 } = await env.reopen(ctx);
  assert.ok(['title', 'profiles'].includes((await sf2('state')).scene), 'reopening should land on the title');
  assert.ok(await G.firstVisible(p2, [SEL.continue, SEL.profile(0)]), 'no Continue / profile button with a colony in progress');
  const s = await continueColony(p2, sf2, 0);
  const after = G.colonyFingerprint(s);
  assert.deepEqual(after, before, 'restored colony differs from the one that was closed');
  clean(p2);
  await B.close(p2);
});

test('save then load gives the same simulation (hash)', async () => {
  const { page, sf } = await env.debug();
  await progress(page, sf, 99);
  await sf('save.now');
  const h1 = await sf('hash');
  const out = await sf('save.export');
  const r = await sf('save.import', out);
  assert.ok(r && r.ok, `import of a fresh export failed: ${JSON.stringify(r)}`);
  await G.stepUntil(page, 's => s.scene === "colony"', { ms: 5000, chunk: 100 });
  assert.equal(await sf('hash'), h1, 'hash changed across export + import');
  clean(page);
  await B.close(page);
});

test('three profiles are independent', async () => {
  const { page, sf } = await env.debug();
  const fps = [];
  for (const p of [0, 1, 2]) {
    await progress(page, sf, 100 + p * 17, p);
    await sf('save.now');
    fps.push(G.colonyFingerprint(await sf('state')));
    await sf('menu');
  }
  assert.notDeepEqual(fps[0], fps[1], 'profiles 0 and 1 have identical colonies: seeds not used or saves shared');
  const ctx = page.context();
  await G.closeTab(page);
  for (const p of [2, 0, 1]) {
    const { page: pg, sf: s } = await env.reopen(ctx);
    const st = await continueColony(pg, s, p);
    assert.equal(st.profile, p, `picked profile ${p} but got ${st.profile}`);
    assert.deepEqual(G.colonyFingerprint(st), fps[p], `profile ${p} did not come back as saved`);
    await G.closeTab(pg);
    // closing writes a pagehide save of the same state: harmless
  }
});

test('a corrupt newest slot falls back to the older one; all keys garbage still gives a working title', async () => {
  const { page, sf } = await env.debug();
  await progress(page, sf, 31);
  await sf('save.now');
  await G.stepUntil(page, 's => false', { ms: 120000, chunk: 5000 });
  await sf('save.now');
  const k = (await G.keys(sf)).profiles[0];
  const good = await sf('save.read');
  const e = await G.saveEntries(page);
  const slots = k.slots;
  assert.ok(slots.length >= 2, `need two slots per profile for fallback, keys: ${JSON.stringify(k)}`);
  const newest = slots.find((key) => (parse(e[key]) || {}).seq === good.seq) || slots[0];
  const older = slots.find((key) => key !== newest && e[key]);
  assert.ok(older, 'only one slot is written after two saves');
  const olderSeq = (parse(e[older]) || {}).seq;
  const ctx = page.context();
  await G.closeTab(page);
  const cases = {
    truncated: (raw) => raw.slice(0, Math.floor(raw.length / 2)),
    // one digit changed past the header: still JSON, checksum wrong
    tampered: (raw) => { const i = raw.slice(raw.length >> 1).search(/\d/) + (raw.length >> 1); return raw.slice(0, i) + ((Number(raw[i]) + 3) % 10) + raw.slice(i + 1); },
    junk: () => '\u0000not json at all',
  };
  for (const [name, f] of Object.entries(cases)) {
    await G.writeStorage(ctx, env.server.url, { ...e, [newest]: f(e[newest]) });
    const { page: p, sf: s } = await env.reopen(ctx);
    const r = await s('save.read');
    assert.ok(r.ok, `${name} newest slot: loader found nothing valid`);
    assert.equal(r.seq, olderSeq, `${name} newest slot: should load the older slot (seq ${olderSeq}), got ${r.seq}`);
    const st = await continueColony(p, s, 0);
    assert.ok(st.buildings.length > 0, `${name}: fallback colony has no buildings`);
    clean(p, [/save|slot|checksum|corrupt/i]);
    await G.closeTab(p);
  }
  // every key garbage
  const garbage = Object.fromEntries(Object.keys(e).map((key) => [key, '{"v":1,"seq":']));
  await G.writeStorage(ctx, env.server.url, garbage);
  const { page: p, sf: s } = await env.reopen(ctx);
  assert.ok(['title', 'profiles'].includes((await s('state')).scene), 'garbage saves broke the title');
  assert.ok(await G.firstVisible(p, [SEL.new, SEL.profile(0)]), 'no way to start a new colony with garbage saves');
  await G.titleToColony(p, s, 0);
  clean(p, [/save|slot|checksum|corrupt|parse/i]);
  await B.close(p);
});

test('every old save version migrates to the current one and loads', async () => {
  const { page, sf } = await env.debug();
  const v = await sf('save.version');
  const migrations = (await sf('save.migrations')) || [];
  assert.ok(Number.isFinite(v), 'save.version is not a number');
  const from = [...new Set([...migrations, ...Array.from({ length: Math.max(0, v - 1) }, (_, i) => i + 1)])].filter((x) => x < v);
  for (const old of from) {
    const fx = await sf('save.fixture', old);
    assert.ok(fx, `no fixture for v${old}`);
    const str = typeof fx === 'string' ? fx : JSON.stringify(fx);
    const r = await sf('save.import', str);
    assert.ok(r && r.ok, `v${old} fixture did not import: ${JSON.stringify(r)}`);
    const s = (await G.stepUntil(page, 's => s.scene === "colony"', { ms: 5000, chunk: 100 })).s;
    assert.equal(s.scene, 'colony', `v${old} fixture did not load into the colony`);
    await sf('save.now');
    const out = parse(await sf('save.export'));
    assert.equal(out && out.v, v, `v${old} save was not upgraded to v${v} on the next write`);
  }
  if (!from.length) assert.ok(v === 1, 'version > 1 but no migrations listed');
  clean(page);
  await B.close(page);
});

test('a save from a future version is refused and left untouched', async () => {
  const { page, sf } = await env.debug();
  await progress(page, sf, 61);
  await sf('save.now');
  const k = (await G.keys(sf)).profiles[0];
  const e = await G.saveEntries(page);
  const key = k.slots.find((x) => e[x]);
  const o = parse(e[key]);
  const v = await sf('save.version');
  o.v = v + 5;
  if ('sum' in o) o.sum = await sf('save.checksum', { ...o, sum: undefined });
  const future = JSON.stringify(o);
  const ctx = page.context();
  await G.closeTab(page);
  const others = Object.fromEntries(k.slots.filter((x) => x !== key).map((x) => [x, null]));
  await G.writeStorage(ctx, env.server.url, { [key]: future, ...others });
  const { page: p, sf: s } = await env.reopen(ctx);
  await sleep(1000);
  const raw = await p.evaluate((kk) => localStorage.getItem(kk), key);
  assert.equal(raw, future, 'a future-version save was overwritten or removed on load');
  const imp = await s('save.import', future);
  assert.ok(imp && !imp.ok, 'import accepted a future version');
  await B.close(p);
});

test('export and import work through the Settings buttons', async () => {
  const { page, sf } = await env.debug();
  await progress(page, sf, 808);
  await sf('save.now');
  const fp = G.colonyFingerprint(await sf('state'));
  await sf('thaw');
  await G.clickOr(page, [SEL.pause], 'Escape');
  await G.clickOr(page, [SEL.settings], null, 3000);
  await G.waitScene(sf, 'settings', 4000);
  const exp = await G.waitVisible(page, [SEL.export], 3000);
  assert.ok(exp, 'no Export button in Settings');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), exp.click()]);
  const file = path.join(os.tmpdir(), `skyforge-export-${process.pid}.json`);
  await dl.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(parse(text), 'exported file is not JSON');
  await G.clickOr(page, [SEL.closeSettings, SEL.close], 'Escape');
  // wipe, then import the file through the button
  await sf('save.wipe');
  await sf('menu');
  await G.waitScene(sf, ['title', 'profiles'], 5000);
  await G.clickOr(page, [SEL.settings], null, 3000);
  await G.waitScene(sf, 'settings', 4000);
  await page.locator(SEL.importFile).first().setInputFiles(file);
  await sleep(800);
  let s = await sf('state');
  if (s.scene !== 'colony') { await G.clickOr(page, [SEL.closeSettings, SEL.close], 'Escape'); s = await continueColony(page, sf, 0); }
  assert.deepEqual(G.colonyFingerprint(s), fp, 'imported colony differs from the exported one');
  const bad = await sf('save.import', '{"nope":true}');
  assert.ok(bad && !bad.ok && bad.error, 'import of garbage was accepted or gave no error');
  fs.rmSync(file, { force: true });
  clean(page, [/import|save/i]);
  await B.close(page);
});

test('plain ?debug writes nothing to storage', async () => {
  const page = await env.open('debug');
  const sf = await G.hook(page);
  await G.freshColony(page, sf);
  await G.stepUntil(page, 's => false', { ms: 600000, chunk: 5000 });
  await sleep(300);
  const e = await G.saveEntries(page);
  const games = Object.keys(e).filter((k) => !/settings/i.test(k));
  assert.deepEqual(games, [], `plain ?debug wrote saves: ${games.join(', ')}`);
  await B.close(page);
});
