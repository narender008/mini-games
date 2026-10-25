// Critical-path playthrough. From a fresh game with no abilities, a bot follows
// the route the graph solver finds in world(): it leaves each room by really
// walking (or falling, or jumping) out through the exit, picks every ability
// up by touching it, fights each boss in god mode to prove the lantern and
// bolts hurt it before finishing it with kill(), and plays on to the ending.
// Midway it saves, reloads the page, continues from the title and checks the
// save round-trips. Writes out/path.md and out/path.json. Exits non-zero on
// any failure.
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');
const graph = require('./lib/graph.cjs');

const OUT = path.join(__dirname, 'out');
const FRAME = 1000 / 60;

// --- in-page routines (serialised into the page; self-contained) ---

function walkExit(eb, from, e, to, rw, rh) {
  const ph = 56, pw = 24;
  let x = e.x + e.w / 2 - pw / 2, y = e.y + e.h - ph - 2, dir = {};
  if (e.side === 'l') { x = 6; dir = { left: true }; }
  else if (e.side === 'r') { x = rw - pw - 6; dir = { right: true }; }
  else if (e.side === 'd') { y = Math.min(e.y, rh) - ph - 60; dir = {}; }
  else if (e.side === 'u') { y = Math.max(e.y, 0) + 30; dir = { up: true, jump: true }; }
  eb.input(null);
  eb.goto(from, x, y);
  eb.kill();
  eb.input(dir);
  let s = eb.state();
  for (let i = 0; i < 150; i++) {
    if (e.side === 'u' && i % 12 === 6) eb.input({ ...dir, jump: false });
    if (e.side === 'u' && i % 12 === 0) eb.input(dir);
    s = eb.step(1000 / 60, { render: false });
    if (s.room === to) break;
  }
  eb.input(null);
  return { ok: s.room === to, room: s.room };
}

function collect(eb, room, p) {
  eb.input(null);
  eb.goto(room, p.x - 12, p.y - 28);
  eb.kill();
  let s = eb.state();
  for (let i = 0; i < 120 && !s.abilities.includes(p.id); i++) {
    if (i === 40) eb.input({ interact: true });
    if (i === 41) eb.input(null);
    if (i === 60) eb.input({ up: true });
    if (i === 61) eb.input(null);
    s = eb.step(1000 / 60, { render: false });
  }
  eb.input(null);
  return { ok: s.abilities.includes(p.id), room: s.room };
}

// Ten seconds of a god-mode fight: walk to the boss, swing, jump, fire bolts.
function fight(eb, id, secs) {
  eb.boss(id);
  eb.god(true);
  let s = eb.state();
  const hp0 = s.boss ? s.boss.hp : null;
  let minHp = hp0;
  const n = Math.round(secs * 60);
  for (let i = 0; i < n && s.boss && s.boss.hp > 0; i++) {
    const p = s.player, b = s.boss;
    const bx = b.x != null ? b.x + (b.w || 0) / 2 : null;
    const px = p.x + p.w / 2;
    const toward = bx == null ? {} : Math.abs(bx - px) > 70 ? (bx > px ? { right: true } : { left: true }) : {};
    const swing = i % 10 < 5;
    const aim = b.x != null ? { x: bx, y: b.y + (b.h || 0) / 2 } : null;
    eb.input({ ...toward, attack: swing, bolt: i % 40 === 0, aim, jump: i % 50 < 15 && bx != null && Math.abs(bx - px) < 140 });
    s = eb.step(1000 / 60, { render: false });
    if (s.boss) minHp = Math.min(minHp, s.boss.hp);
  }
  eb.input(null);
  return { started: hp0 != null, hp0, minHp, room: s.room, hasPos: !!(s.boss && s.boss.x != null) };
}

function finish(eb) {
  eb.kill();
  let s = eb.state();
  for (let i = 0; i < 300 && s.boss; i++) s = eb.step(1000 / 60, { render: false });
  for (let i = 0; i < 60; i++) s = eb.step(1000 / 60, { render: false });
  return s;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(process.env.EB_ROOT);
  const browser = await launch();
  const page = await open(browser, server.url, 'debug&seed=7');
  let eb = await G.hook(page);
  const run = (fn, ...a) => G.inPage(page, fn, ...a);
  const W = await eb('world');
  const sol = graph.solve(W);
  const room = (id) => W.rooms.find((r) => r.id === id);
  const px = (r) => ({ w: r.tw * W.tile, h: r.th * W.tile });

  const failures = [], notes = [], hops = [], bosses = [], pickups = [];
  let saveCheck = null;
  const t0 = Date.now();
  if (!sol.endingReachable) failures.push('graph: the ending is not reachable (see world checks)');

  await G.fresh(eb);
  const done = new Set();

  async function arrive(id) {
    const r = room(id);
    let s = await eb('state');
    if (r.boss && !s.bossesDefeated.includes(r.boss)) {
      const f = await run(fight, r.boss, 10);
      const rec = { id: r.boss, room: id, started: f.started, hp0: f.hp0, minHp: f.minHp };
      if (!f.started) failures.push(`boss ${r.boss}: boss() did not start a fight`);
      else if (f.minHp >= f.hp0) (f.hasPos ? failures : notes).push(`boss ${r.boss}: 10 s of attacks did no damage${f.hasPos ? '' : ' (state().boss has no x, y to aim at)'}`);
      s = await run(finish, null);
      rec.defeated = s.bossesDefeated.includes(r.boss) || (r.boss === G.FINAL_BOSS && s.scene === 'won');
      if (!rec.defeated) failures.push(`boss ${r.boss}: kill() did not mark it defeated (scene ${s.scene})`);
      bosses.push(rec);
      if (r.boss === G.FINAL_BOSS) return;
    }
    for (const p of (r.pickups || []).filter((p) => p.kind === 'ability')) {
      s = await eb('state');
      if (s.abilities.includes(p.id)) continue;
      const c = await run(collect, id, p);
      pickups.push({ id: p.id, room: id, ok: c.ok });
      if (!c.ok) { failures.push(`pickup ${p.id} in ${id}: touching it did not grant the ability`); await eb('grant', p.id); }
    }
    s = await eb('state');
    if (!saveCheck && s.bossesDefeated.length >= 2) saveCheck = await saveLoad();
  }

  async function saveLoad() {
    const before = await eb('state');
    const saved = await eb('save');
    const raw = await page.evaluate((k) => localStorage.getItem(k), G.SAVE_KEY);
    const rec = { room: before.room, checkpoint: before.checkpoint, abilities: before.abilities, bosses: before.bossesDefeated, savedBytes: raw ? raw.length : 0 };
    if (!raw) failures.push(`save(): nothing in localStorage under ${G.SAVE_KEY}`);
    await page.reload({ waitUntil: 'load' });
    eb = await G.hook(page);
    const btn = await G.firstVisible(page, G.SEL.continue);
    if (!btn) failures.push('after a save the title shows no #btn-continue');
    if (btn) await btn.click(); else await page.keyboard.press('Enter');
    let s;
    try { s = await G.waitScene(eb, 'play', 5000); } catch (e) { failures.push(`continue: ${e.message}`); return rec; }
    await eb('freeze');
    await eb('god', true);
    const sort = (a) => [...a].sort().join(',');
    rec.after = { room: s.room, abilities: s.abilities, bosses: s.bossesDefeated };
    if (sort(s.abilities) !== sort(before.abilities)) failures.push(`save/load: abilities ${sort(before.abilities)} came back as ${sort(s.abilities)}`);
    if (sort(s.bossesDefeated) !== sort(before.bossesDefeated)) failures.push(`save/load: bosses ${sort(before.bossesDefeated)} came back as ${sort(s.bossesDefeated)}`);
    if (![before.room, before.checkpoint, saved && saved.room, saved && saved.checkpoint].includes(s.room)) failures.push(`save/load: continued in ${s.room}, saved in ${before.room} (checkpoint ${before.checkpoint})`);
    rec.ok = true;
    return rec;
  }

  await arrive(W.start.room);
  for (const hop of sol.route) {
    let s = await eb('state');
    if (s.scene === 'won') break;
    const have = new Set([...s.abilities, ...s.bossesDefeated.map((b) => `boss:${b}`)]);
    const missing = graph.needs(hop.exit).filter((q) => !have.has(q));
    if (missing.length) failures.push(`${hop.from} -> ${hop.to}: the route needs ${missing.join(', ')} the game has not given`);
    const r = room(hop.from);
    const w = await run(walkExit, hop.from, hop.exit, hop.to, px(r).w, px(r).h);
    hops.push({ from: hop.from, to: hop.to, side: hop.exit.side, walked: w.ok, landed: w.room });
    if (!w.ok) await eb('goto', hop.to);
    if (!done.has(hop.to)) { done.add(hop.to); await arrive(hop.to); }
  }

  let s = await eb('state');
  if (s.scene !== 'won') {
    // the ending: beat the Cinder King if the route has not yet
    if (!s.bossesDefeated.includes(G.FINAL_BOSS)) {
      const f = await run(fight, G.FINAL_BOSS, 10);
      bosses.push({ id: G.FINAL_BOSS, started: f.started, hp0: f.hp0, minHp: f.minHp });
      s = await run(finish, null);
    }
    try { s = await G.waitScene(eb, 'won', 5000); } catch {}
  }
  if (s.scene !== 'won') failures.push(`the run did not end in 'won' (scene ${s.scene}, room ${s.room})`);
  for (const a of G.ABILITIES) if (!pickups.some((p) => p.id === a && p.ok)) failures.push(`ability ${a} was never picked up on the route`);
  for (const b of G.BOSSES) if (!bosses.some((x) => x.id === b && x.defeated !== false)) failures.push(`boss ${b} was never fought on the route`);
  if (!saveCheck) failures.push('the save/load check never ran (fewer than two bosses beaten)');
  if (page.problems.length) failures.push(...page.problems.slice(0, 5));

  const walked = hops.filter((h) => h.walked).length;
  const stuck = hops.filter((h) => !h.walked);
  if (stuck.length) notes.push(`${stuck.length} of ${hops.length} exits could not be walked through and were teleported: ${stuck.map((h) => `${h.from} -${h.side}-> ${h.to}`).join(', ')}`);
  const report = { ok: !failures.length, secs: (Date.now() - t0) / 1000, failures, notes, order: sol.order, hops, bosses, pickups, saveCheck };
  fs.writeFileSync(path.join(OUT, 'path.json'), JSON.stringify(report, null, 2));
  const md = [
    `# Emberfall critical-path playthrough`, '',
    `Result: **${report.ok ? 'PASS' : 'FAIL'}** in ${report.secs.toFixed(0)} s. ${hops.length} room transitions (${walked} walked, ${hops.length - walked} teleported).`, '',
    '## Order found', ...sol.order.map((o) => `- ${o.got} in ${o.room}`), '',
    '## Bosses', ...bosses.map((b) => `- ${b.id}: hp ${b.hp0} -> ${b.minHp} from attacks, defeated ${b.defeated}`), '',
    '## Save / load', saveCheck ? `- saved in ${saveCheck.room} with ${saveCheck.abilities.join(', ')}; continued in ${saveCheck.after?.room}` : '- not run', '',
    ...(failures.length ? ['## Failures', ...failures.map((f) => `- ${f}`), ''] : []),
    ...(notes.length ? ['## Notes', ...notes.map((f) => `- ${f}`), ''] : []),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'path.md'), md);
  console.log(md);
  await browser.close();
  await server.close();
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
