// Story progression: dialogue is data with unique ids, the hub has something
// new to say after each run, Sable speaks after the first death, each boss
// leaves a reveal behind after its first defeat, and beating Sable sets the
// first ending. Story flags survive a reload.
const { test } = require('node:test');
const { suite, clean, assert, B, G } = require('./lib/suite.cjs');
const env = suite();

// Talks to every hub character once and returns the line ids heard.
async function talkAround(page, lw, npcs) {
  const heard = [];
  for (const id of npcs) {
    let s = await lw('state');
    if (s.scene !== 'hub') { await G.stepUntil(page, 's => { if (s.scene === "dialogue") window.__lw.skip(); return s.scene === "hub"; }', { ms: 20000, chunk: 100 }); }
    try { await lw('talk', id); } catch { continue; }
    for (let i = 0; i < 40; i++) {
      s = (await G.stepUntil(page, 's => true', { ms: 50, chunk: 50 })).s;
      if (s.dialogue && s.dialogue.lineId && !heard.includes(s.dialogue.lineId)) heard.push(s.dialogue.lineId);
      if (s.scene !== 'dialogue') break;
      await lw('advance');
    }
    await lw('skip').catch(() => {});
  }
  return heard;
}

async function backToHub(page, lw) {
  const r = await G.stepUntil(page, 's => { if (s.scene === "dialogue") window.__lw.advance(); if (["dead","victory","ending"].includes(s.scene)) { const b = document.querySelector("#btn-return"); if (b) b.click(); } return s.scene === "hub"; }', { ms: 60000, chunk: 100 });
  assert.ok(r.ok, `did not get back to the hub (scene '${r.s.scene}')`);
  return r.s;
}

test('dialogue is data: unique ids, every speaker known, a few hundred lines', async () => {
  const { page, lw } = await env.debug();
  const c = await lw('content');
  const lines = c.dialogue || [];
  const ids = lines.map((l) => l.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dup, [], `duplicate dialogue ids: ${[...new Set(dup)].join(', ')}`);
  assert.ok(lines.length >= 150, `only ${lines.length} dialogue lines (plan: about 300 at launch)`);
  const speakers = new Set(lines.map((l) => l.speaker));
  for (const who of ['orrin', 'sable', 'veyl', 'morrow', 'aurum']) assert.ok([...speakers].some((s) => String(s).toLowerCase().includes(who)), `no lines for ${who}`);
  assert.ok((c.memoryThreads || []).length >= 12, `expected 12 Memory Threads, got ${(c.memoryThreads || []).length}`);
  clean(page);
  await B.close(page);
});

test('the story moves on run by run: new hub lines, Sable after the first death, reveals after bosses, the first ending', async () => {
  const { page, lw } = await env.debug();
  const c = await lw('content');
  const speakers = [...new Set((c.dialogue || []).map((l) => l.speaker))];
  const npcs = ['orrin', 'thimbleby', 'pell', 'nell'].map((n) => speakers.find((s) => String(s).toLowerCase().includes(n))).filter(Boolean);
  assert.ok(npcs.length >= 3, `hub characters missing from dialogue speakers: ${speakers.join(', ')}`);
  await lw('freeze');
  await G.titleToHub(page, lw, 0).catch(async () => { await lw('hub'); });
  let s = await lw('state');
  const seen0 = new Set(s.story.seen);
  const heard0 = await talkAround(page, lw, npcs);
  assert.ok(heard0.length >= 2, `talking to ${npcs.join(', ')} in the hub gave ${heard0.length} lines`);

  // run 1: die in the first chamber
  await lw('play', { seed: 21 });
  await G.waitSceneStepped(page, lw, G.RUN_SCENES);
  await lw('kill');
  s = await backToHub(page, lw);
  assert.equal(s.story.deaths, 1);
  assert.equal(s.story.runs, 1, 'a run that ended in death is not counted');
  const sableLine = (c.dialogue || []).filter((l) => /sable/i.test(l.speaker)).map((l) => l.id).find((id) => s.story.seen.includes(id));
  assert.ok(sableLine, 'Sable did not speak after the first death');
  const heard1 = await talkAround(page, lw, npcs);
  const fresh1 = heard1.filter((id) => !heard0.includes(id));
  assert.ok(fresh1.length >= 1, 'the hub has nothing new to say after the first death');

  // each boss beaten once: a reveal or new lines each time
  const revealsBefore = new Set(s.story.reveals || []);
  for (const id of G.BOSSES) {
    const seenBefore = new Set((await lw('state')).story.seen);
    await lw('boss', id);
    const r = await G.stepUntil(page, `s => s.boss && s.boss.id === ${JSON.stringify(id)}`, { ms: 10000, chunk: 100 });
    assert.ok(r.ok, `boss ${id} did not start`);
    await lw('god', true);
    for (let k = 0; k < 3; k++) { // Sable has two phases
      const now = await lw('state');
      if (!now.boss) break;
      await lw('bossKill');
      await G.stepUntil(page, 's => !s.boss || s.scene !== "run"', { ms: 15000, chunk: 100 });
    }
    s = await backToHub(page, lw);
    const after = new Set(s.story.seen);
    const newLines = [...after].filter((x) => !seenBefore.has(x));
    assert.ok(newLines.length >= 1, `beating ${id} added no story lines`);
  }
  const reveals = (s.story.reveals || []).filter((x) => !revealsBefore.has(x));
  assert.ok(reveals.length >= 3, `expected the three reveals (Veyl, Morrow, Aurum) after their first defeats, got ${JSON.stringify(s.story.reveals)}`);
  assert.equal(s.story.ending, 'first', 'beating Sable did not set the first ending');
  assert.ok(s.story.seen.length > seen0.size + 10, 'the story barely advanced over five runs');
  clean(page);
  await B.close(page);
});

test('story progress is saved and comes back after a reload', async () => {
  const { page, lw } = await env.debug();
  await lw('freeze');
  await G.titleToHub(page, lw, 0).catch(async () => { await lw('hub'); });
  await lw('play', { seed: 3 });
  await G.waitSceneStepped(page, lw, G.RUN_SCENES);
  await lw('kill');
  const s = await backToHub(page, lw);
  await lw('save.now');
  const ctx = page.context();
  await page.close({ runBeforeUnload: true });
  const { page: p, lw: l } = await env.reopen(ctx);
  await G.titleToHub(p, l, 0);
  const s2 = await l('state');
  assert.equal(s2.story.deaths, s.story.deaths);
  assert.deepEqual([...s2.story.seen].sort(), [...s.story.seen].sort(), 'seen dialogue was not saved');
  clean(p);
  await p.close();
});
