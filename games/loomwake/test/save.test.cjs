// The save system: a checkpoint at every chamber door and on pagehide, a
// reload resuming the same chamber with the same build, seeded rewards that
// do not change on reload, A/B slots with checksums that recover from a
// corrupt slot, a migration test for every old version, future versions left
// alone, three independent profiles, export/import, settings kept apart from
// game saves, and nothing written under plain ?debug.
//
// Key layout: loomwake.p<0..2>.a / .b and loomwake.settings (lib/game.cjs).
const { test } = require('node:test');
const { suite, clean, assert, B, G } = require('./lib/suite.cjs');
const env = suite();
const { sleep } = G;

// The contract's layout (loomwake.p<N>.a/.b, loomwake.settings) unless
// save.keys() says otherwise in the { settings, profiles: [{ a, b }] } shape.
async function keys(lw) {
  let k = null;
  try { k = await lw('save.keys'); } catch {}
  if (k && k.profiles && k.profiles.length === 3 && k.settings) return k;
  return G.SAVE_KEYS;
}

// Plays into the run: clear the first chamber, take a card, go through a door,
// then a second clear and card so the build has something in it.
async function progress(page, lw, seed = 4242, chambers = 2) {
  await G.freshRun(page, lw, { seed });
  for (let i = 0; i < chambers; i++) {
    await lw('clear');
    let r = await G.stepUntil(page, 's => (s.offer && s.offer.length) || (s.cleared && s.doors.some((d) => d.open))', { ms: 10000 });
    if (r.s.offer && r.s.offer.length) { await lw('choose', 0); r = await G.stepUntil(page, 's => s.cleared && s.doors.some((d) => d.open)', { ms: 10000 }); }
    assert.ok(r.ok, `chamber ${i} never opened its doors`);
    const c = r.s.chamber;
    // a boon door when there is one, so the next chamber offers cards
    const open = r.s.doors.filter((d) => d.open);
    await lw('door', (open.find((d) => /boon/i.test(String(d.reward))) || open[0]).i);
    r = await G.stepUntil(page, `s => s.scene === 'run' && s.chamber !== ${c}`, { ms: 10000, chunk: 100 });
    assert.ok(r.ok, 'door did not lead to the next chamber');
  }
  return lw('state');
}

const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

async function continueRun(page, lw, profile = null) {
  let s = await G.waitScene(lw, ['title', 'profiles', ...G.RUN_SCENES], 5000);
  if (s.scene === 'title') { await G.clickOr(page, [G.SEL.continue]); await sleep(400); s = await lw('state'); }
  if (s.scene === 'profiles') { await G.clickOr(page, [G.SEL.profile(profile ?? s.profile ?? 0)]); await sleep(400); }
  return G.waitScene(lw, G.RUN_SCENES, 10000);
}

test('a checkpoint is written at every chamber door', async () => {
  const { page, lw } = await env.debug();
  await G.freshRun(page, lw, { seed: 11 });
  const seqs = [];
  for (let i = 0; i < 3; i++) {
    await lw('clear');
    let r = await G.stepUntil(page, 's => (s.offer && s.offer.length) || (s.cleared && s.doors.some((d) => d.open))', { ms: 10000 });
    if (r.s.offer && r.s.offer.length) await lw('choose', 0);
    r = await G.stepUntil(page, 's => s.cleared && s.doors.some((d) => d.open)', { ms: 10000 });
    const before = (await lw('save.read')).seq ?? -1; // no save yet reads as seq null/undefined
    await lw('door', r.s.doors.findIndex((d) => d.open));
    await G.stepUntil(page, `s => s.scene === 'run' && s.chamber !== ${r.s.chamber}`, { ms: 10000, chunk: 100 });
    const after = await lw('save.read');
    assert.ok(after.ok && after.seq > before, `no new checkpoint at door ${i} (seq ${before} -> ${after.seq})`);
    seqs.push(after.seq);
  }
  // writes alternate between the two slots
  const k = await keys(lw);
  const e = await G.saveEntries(page);
  assert.ok(e[k.profiles[0].a] && e[k.profiles[0].b], 'both A and B slots should be written after a few doors');
  clean(page);
  await B.close(page);
});

test('closing the tab mid-chamber and coming back resumes the same chamber, build and rewards', async () => {
  const { page, lw } = await env.debug();
  const s0 = await progress(page, lw, 5151, 2);
  await lw('thaw');
  await sleep(300);
  const fp = G.runFingerprint(await lw('state'));
  const ctx = page.context();
  await G.closeTab(page); // fires pagehide
  const { page: p2, lw: lw2 } = await env.reopen(ctx);
  assert.equal((await lw2('state')).scene, 'title', 'reopening should land on the title');
  assert.ok(await G.firstVisible(p2, [G.SEL.continue]), 'no Continue button with a run in progress');
  const s = await continueRun(p2, lw2);
  const got = G.runFingerprint(s);
  // health may be the door-time value or the pagehide value; everything else must match
  const { hp: h1, ...a } = fp; const { hp: h2, ...b } = got;
  assert.deepEqual(b, a, 'resumed run differs from the one that was closed');
  assert.ok(h2 > 0 && h2 <= s0.hero.maxHp, `resumed health ${h2} is out of range`);
  clean(p2);
  await B.close(p2);
});

test('rewards are seeded: reloading a checkpoint gives the same doors and boon offer', async () => {
  const { page, lw } = await env.debug();
  await progress(page, lw, 777, 1);
  const s1 = await lw('state');
  // the door checkpoint as written: put back before every reload, since
  // closing a tab writes a pagehide save of whatever state it was in
  const checkpoint = await G.saveEntries(page);
  // the chamber's reward: boon cards if it came through a boon door, else
  // whatever it gives (then only the doors are compared)
  const rewardOrOpen = 's => (s.offer && s.offer.length) || (s.cleared && s.doors.some((d) => d.open))';
  await lw('clear');
  const r1 = await G.stepUntil(page, rewardOrOpen, { ms: 10000 });
  assert.ok(r1.ok, `chamber ${s1.chamber} gave no reward and opened no door after clear (scene '${r1.s.scene}')`);
  const offer1 = (r1.s.offer || []).map((o) => `${o.id}:${o.rarity}`);
  const doors1 = r1.s.doors.map((d) => d.reward);
  const ctx = page.context();
  await G.closeTab(page);
  for (let k = 0; k < 2; k++) {
    await G.writeStorage(ctx, env.server.url, checkpoint);
    const { page: p, lw: l } = await env.reopen(ctx);
    const s = await continueRun(p, l);
    assert.equal(s.chamber, s1.chamber, 'checkpoint did not restore the chamber');
    await l('freeze');
    await l('clear');
    const r = await G.stepUntil(p, rewardOrOpen, { ms: 10000 });
    assert.deepEqual((r.s.offer || []).map((o) => `${o.id}:${o.rarity}`), offer1, `boon offer changed after reload ${k + 1}`);
    assert.deepEqual(r.s.doors.map((d) => d.reward), doors1, `door rewards changed after reload ${k + 1}`);
    await G.closeTab(p);
  }
});

test('a corrupt newest slot falls back to the other; both corrupt still leaves a working title', async () => {
  const { page, lw } = await env.debug();
  await progress(page, lw, 31, 2);
  const k = (await keys(lw)).profiles[0];
  const good = await lw('save.read');
  const e = await G.saveEntries(page);
  const newest = good.slot === 'a' || good.slot === 'A' ? k.a : k.b;
  const other = newest === k.a ? k.b : k.a;
  const olderSeq = (parse(e[other]) || {}).seq;
  assert.ok(Number.isFinite(olderSeq) && olderSeq < good.seq, `the other slot should hold an older save: ${String(e[other]).slice(0, 80)}`);
  const ctx = page.context();
  await G.closeTab(page);
  // each case writes both slots from the recorded entries (closing a page
  // writes a pagehide save, so storage is never left as the test found it)
  const tamper = (newestRaw) => G.writeStorage(ctx, env.server.url, { [other]: e[other], [newest]: newestRaw });

  // 1. truncated newest slot
  await tamper(e[newest].slice(0, e[newest].length >> 1));
  let { page: p, lw: l } = await env.reopen(ctx);
  let r = await l('save.read');
  assert.ok(r.ok && r.seq === olderSeq, `loader did not fall back to the older slot (seq ${olderSeq}): ${JSON.stringify(r)}`);
  let s = await continueRun(p, l);
  assert.equal(s.region, G.REGIONS[0]);
  clean(p);
  await G.closeTab(p);

  // 2. right JSON, wrong checksum (a field edited by hand)
  const o = JSON.parse(e[newest]);
  const walk = (x) => { for (const key of Object.keys(x)) { if (typeof x[key] === 'number' && /hp|lumen|run|chamber/i.test(key)) { x[key] += 999; return true; } if (x[key] && typeof x[key] === 'object' && walk(x[key])) return true; } return false; };
  assert.ok(walk(o), 'found no numeric field to tamper with in the save');
  await tamper(JSON.stringify(o));
  ({ page: p, lw: l } = await env.reopen(ctx));
  r = await l('save.read');
  assert.ok(r.ok && r.seq === olderSeq, `a slot with a bad checksum was accepted: ${JSON.stringify(r)}`);
  await G.closeTab(p);

  // 3. both slots garbage: the title works and a new game starts
  await G.writeStorage(ctx, env.server.url, { [k.a]: '{"v":', [k.b]: 'not json at all \u0000' });
  ({ page: p, lw: l } = await env.reopen(ctx));
  await G.waitScene(l, 'title', 5000);
  s = await G.titleToHub(p, l, 0);
  assert.equal(s.scene, 'hub');
  clean(p);
  await p.close();
});

test('every migration step upgrades an old save, and a future version is left untouched', async () => {
  const { page, lw } = await env.debug();
  const version = await lw('save.version');
  const steps = (await lw('save.migrations')) || [];
  assert.ok(Number.isInteger(version) && version >= 1, `save.version should be an integer, got ${version}`);
  const k = (await keys(lw)).profiles[0];
  const ctx = page.context();
  const froms = [...new Set([...steps, ...Array.from({ length: version - 1 }, (_, i) => i + 1)])].filter((v) => v < version);
  for (const v of froms) {
    const fx = await lw('save.fixture', v);
    assert.ok(fx, `no fixture for save version ${v}`);
    await page.evaluate(([a, b, raw]) => { localStorage.removeItem(b); localStorage.setItem(a, raw); }, [k.a, k.b, typeof fx === 'string' ? fx : JSON.stringify(fx)]);
    const { page: p, lw: l } = await env.reopen(ctx);
    const r = await l('save.read');
    assert.ok(r.ok, `save v${v} was not accepted: ${JSON.stringify(r)}`);
    await G.titleToHub(p, l, 0, { allowRun: true });
    // read() may report the migrated version or the stored one; the next
    // write must be the current version either way
    if (r.v !== version) {
      await l('save.now');
      const r2 = await l('save.read');
      assert.ok(r2.ok && r2.v === version, `save v${v} did not migrate to v${version}: ${JSON.stringify(r)} then ${JSON.stringify(r2)}`);
    }
    clean(p);
    await G.closeTab(p); // waited for, so a late pagehide write cannot land on the next fixture
  }
  // a save from the future: kept as is, never overwritten
  const future = JSON.stringify({ v: version + 50, seq: 1, data: { note: 'from a newer build' } });
  await page.evaluate(([a, b, raw]) => { localStorage.removeItem(b); localStorage.setItem(a, raw); }, [k.a, k.b, future]);
  const { page: p, lw: l } = await env.reopen(ctx);
  await sleep(1500);
  const raw = await p.evaluate((a) => localStorage.getItem(a), k.a);
  assert.equal(raw, future, 'a save from a newer version was changed by loading it');
  clean(p, [/newer|future|version/i]);
  await p.close();
  await B.close(page);
});

test('three profiles keep their own progress', async () => {
  const { page, lw } = await env.debug();
  const k = await keys(lw);
  const seen = [];
  for (const i of [0, 2]) {
    await lw('menu');
    await lw('thaw');
    await G.titleToHub(page, lw, i);
    const s = await progress(page, lw, 300 + i, i === 0 ? 1 : 2);
    seen.push({ i, chamber: s.chamber, boons: s.boons.length });
    await lw('save.now');
  }
  const e = await G.saveEntries(page);
  assert.ok(e[k.profiles[0].a] || e[k.profiles[0].b], 'profile 1 has no save');
  assert.ok(!e[k.profiles[1].a] && !e[k.profiles[1].b], 'profile 2 was written without being played');
  assert.ok(e[k.profiles[2].a] || e[k.profiles[2].b], 'profile 3 has no save');
  // each profile comes back on its own: reopen with ?profile=i and Continue
  // (whether Continue resumes directly or goes by the profile picker)
  const ctx = page.context();
  clean(page);
  await G.closeTab(page);
  for (const { i, chamber } of seen) {
    const { page: p, lw: l } = await env.reopen(ctx, `debug&save=1&profile=${i}`);
    const s = await continueRun(p, l, i);
    assert.equal(s.profile, i);
    assert.equal(s.chamber, chamber, `profile ${i + 1} came back in the wrong chamber`);
    clean(p);
    await G.closeTab(p);
  }
});

test('export then wipe then import restores the save, through the hook and through the Settings buttons', async () => {
  const { page, lw } = await env.debug();
  const s0 = await progress(page, lw, 99, 2);
  await lw('save.now');
  const json = await lw('save.export');
  const o = parse(json);
  assert.ok(o && o.v && (o.checksum || o.sum || o.crc), 'export is not JSON with a version and checksum');
  // a damaged export is refused: one number inside the checksummed data changed
  const damaged = JSON.parse(json);
  const bump = (x) => { for (const key of Object.keys(x)) { if (typeof x[key] === 'number') { x[key] += 1; return true; } if (x[key] && typeof x[key] === 'object' && bump(x[key])) return true; } return false; };
  assert.ok(bump(damaged.run || {}) || bump(damaged.meta || damaged.data || {}), 'found no number to damage in the export');
  const bad = await lw('save.import', JSON.stringify(damaged));
  assert.ok(bad && bad.ok === false, 'an export with a wrong checksum was accepted');
  // wipe with the game closed (its pagehide save would otherwise put the run
  // back and hide a failed import), then import from a fresh page on the title
  const ctx = page.context();
  await G.closeTab(page);
  await G.writeStorage(ctx, env.server.url, null);
  let { page: p, lw: l } = await env.reopen(ctx);
  assert.equal((await l('save.read')).ok, false, 'the wipe left a save behind');
  const ok = await l('save.import', json);
  assert.ok(ok && ok.ok, `import failed: ${JSON.stringify(ok)}`);
  await G.closeTab(p);
  ({ page: p, lw: l } = await env.reopen(ctx));
  let s = await continueRun(p, l);
  assert.deepEqual(G.runFingerprint(s).boons, G.runFingerprint(s0).boons, 'imported save lost the build');
  assert.equal(s.chamber, s0.chamber);

  // the real buttons: Export downloads a file, Import takes it back
  await l('menu');
  await l('thaw');
  await G.clickOr(p, [G.SEL.settings], null);
  // Settings may open on another tab: go to the save one
  if (!(await G.waitVisible(p, [G.SEL.export], 800))) await p.evaluate(() => { const t = [...document.querySelectorAll('[role="tab"], [data-tab], button')].find((b) => /save/i.test(b.textContent) && b.offsetParent); if (t) t.click(); });
  const exp = await G.waitVisible(p, [G.SEL.export]);
  assert.ok(exp, 'no Export button in Settings');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), exp.click()]);
  const file = await dl.path();
  assert.ok(/\.json$/i.test(dl.suggestedFilename()), `export file name ${dl.suggestedFilename()} is not .json`);
  await p.evaluate(() => localStorage.clear());
  const input = p.locator(G.SEL.importFile).first();
  assert.ok(await input.count(), 'no file input for Import');
  await input.setInputFiles(file);
  await sleep(800);
  const r = await l('save.read');
  assert.ok(r.ok, `importing the downloaded file did not restore a save: ${JSON.stringify(r)}`);
  clean(p);
  await G.closeTab(p);
});

test('settings live apart from game saves and survive a corrupt one', async () => {
  const { page, lw } = await env.debug();
  const k = await keys(lw);
  await page.evaluate((key) => { const o = JSON.parse(localStorage.getItem(key) || '{}'); localStorage.setItem(key, JSON.stringify({ ...o, volume: 0.37, music: 0.37 })); }, k.settings);
  await page.evaluate(([a, b]) => { localStorage.setItem(a, '{{{'); localStorage.setItem(b, '}}}'); }, [k.profiles[0].a, k.profiles[0].b]);
  const ctx = page.context();
  await G.closeTab(page);
  const { page: p } = await env.reopen(ctx);
  await sleep(800);
  const st = await p.evaluate((key) => localStorage.getItem(key), k.settings);
  assert.ok(st && st.includes('0.37'), `settings were reset by a corrupt game save: ${st}`);
  clean(p);
  await p.close();
});

test('plain ?debug writes nothing', async () => {
  const page = await env.open('debug');
  const lw = await G.hook(page);
  await G.freshRun(page, lw, { seed: 5 });
  await lw('clear');
  await G.stepUntil(page, 's => s.cleared', { ms: 8000 });
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  const e = await page.evaluate(() => Object.keys(localStorage).filter((k) => /loomwake/i.test(k) && !/settings/i.test(k)));
  assert.deepEqual(e, [], 'a game save was written under ?debug without save=1');
  await B.close(page);
});
