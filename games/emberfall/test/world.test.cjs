// World and physics checks through the ?debug hook: the map in world() is
// sound and completable, every room renders and has floors you cannot fall
// through, the jump, double jump and dash match the PHYS constants the rooms
// are designed against, and the tile gates block without their ability and
// give way with it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, frameStats } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');
const graph = require('./lib/graph.cjs');
const M = require('./lib/moves.cjs');

const OUT = path.join(__dirname, 'out');
let server, browser, page, eb, W;
before(async () => {
  server = await serve(process.env.EB_ROOT);
  browser = await launch();
  page = await open(browser, server.url, 'debug&seed=7');
  eb = await G.hook(page);
  W = await eb('world');
  fs.mkdirSync(OUT, { recursive: true });
});
after(async () => { await browser?.close(); await server?.close(); });

const tol = (got, want, frac) => Math.abs(got - want) <= want * frac;
const room = (id) => W.rooms.find((r) => r.id === id);

const sim = (fn, ...args) => M.sim(page, fn, ...args);

function findFlat(minLen, minClear) {
  for (const r of W.rooms) {
    if (r.boss) continue;
    const f = G.flats(r, minLen, minClear)[0];
    if (f) return { room: r, flat: f };
  }
  return null;
}

test('world() is a complete, consistent map', () => {
  assert.ok(W && Array.isArray(W.rooms) && W.rooms.length >= 8, `world() has ${W?.rooms?.length} rooms`);
  assert.equal(W.tile, 40);
  const ids = new Set();
  for (const r of W.rooms) {
    assert.ok(!ids.has(r.id), `duplicate room id ${r.id}`);
    ids.add(r.id);
    assert.equal(r.tiles.length, r.th, `room ${r.id}: ${r.tiles.length} tile rows, th ${r.th}`);
    for (const row of r.tiles) assert.equal(row.length, r.tw, `room ${r.id}: a row of ${row.length} tiles, tw ${r.tw}`);
    for (const g of r.gates || []) assert.ok(G.ABILITIES.includes(g.requires), `room ${r.id} gate ${g.id}: requires unknown ability ${g.requires}`);
    for (const e of r.exits || []) for (const q of e.requires || []) assert.ok(G.ABILITIES.includes(q) || /^boss:/.test(q), `room ${r.id}: exit requires unknown ${q}`);
  }
  assert.deepEqual(W.abilityOrder, G.ABILITIES, 'abilityOrder');
  for (const b of G.BOSSES) assert.ok(W.rooms.some((r) => r.boss === b), `no room holds boss ${b}`);
  for (const a of G.ABILITIES) assert.ok(W.rooms.some((r) => (r.pickups || []).some((p) => p.kind === 'ability' && p.id === a)), `no pickup for ability ${a}`);
  assert.ok(W.rooms.some((r) => r.ending), 'no ending room');
  // exits on facing edges of rooms that touch on the world grid lead both ways
  const oneWay = [];
  for (const r of W.rooms) for (const e of r.exits || []) {
    const back = { l: 'r', r: 'l', u: 'd', d: 'u' }[e.side];
    if (!(room(e.to)?.exits || []).some((x) => x.to === r.id && x.side === back)) oneWay.push(`${r.id} -${e.side}-> ${e.to}`);
  }
  if (oneWay.length) console.log(`note: one-way exits (no matching exit back): ${oneWay.join(', ')}`);
});

test('the critical path is completable from a fresh start', () => {
  const sol = graph.solve(W);
  fs.writeFileSync(path.join(OUT, 'route.json'), JSON.stringify(sol, null, 2));
  assert.deepEqual(sol.problems, []);
  assert.deepEqual(sol.missingAbilities, [], 'abilities that can never be reached');
  assert.deepEqual(sol.missingBosses, [], 'bosses that can never be reached');
  assert.ok(sol.endingReachable, 'the ending room cannot be reached');
  const got = sol.order.filter((o) => !o.got.startsWith('boss:')).map((o) => o.got);
  if (got.join() !== G.ABILITIES.join()) console.log(`note: a greedy run finds abilities as ${got.join(', ')}`);
  for (const w of graph.gateWarnings(W)) console.log(`note: ${w}`);
  if (sol.unreachedRooms.length) console.log(`note: rooms never reached: ${sol.unreachedRooms.join(', ')}`);
  // with nothing at all, the ending and the last boss are out of reach
  const bare = graph.reach(W, new Set());
  const end = W.rooms.find((r) => r.ending);
  assert.ok(!bare.has(end.id), 'the ending is reachable with no abilities');
});

test('every room renders a non-blank frame without errors', async () => {
  await G.fresh(eb);
  const bad = [];
  for (const r of W.rooms) {
    page.problems.length = 0;
    await eb('goto', r.id);
    await eb('step', 300);
    await G.sleep(60);
    const s = await eb('state');
    const st = await frameStats(page);
    if (s.room !== r.id) bad.push(`${r.id}: goto landed in ${s.room}`);
    else if (st.std < 8 || st.colours < 30) bad.push(`${r.id}: blank frame ${JSON.stringify(st)}`);
    if (page.problems.length) bad.push(`${r.id}: ${page.problems[0]}`);
  }
  assert.deepEqual(bad, []);
});

test('nobody falls through a floor, in any room', async () => {
  await G.fresh(eb);
  const bad = [];
  for (const r of W.rooms) {
    // up to 8 columns over plain floor, dropped from the top of the open air above
    const cols = [];
    for (let ty = 2; ty < r.th; ty++) for (let tx = 1; tx < r.tw - 1; tx++) {
      if (G.tileAt(r, tx, ty) !== '#' || !G.isOpen(G.tileAt(r, tx, ty - 1)) || !G.isOpen(G.tileAt(r, tx, ty - 2))) continue;
      let top = ty - 1;
      while (top > 1 && ty - top < 10 && G.isOpen(G.tileAt(r, tx, top - 1))) top--;
      // skip columns a moving platform passes through
      if ((r.platforms || []).some((pl) => {
        const xs = [pl.x, ...(pl.path || []).map((q) => q.x)], ys = [pl.y, ...(pl.path || []).map((q) => q.y)];
        return tx * W.tile + W.tile > Math.min(...xs) && tx * W.tile < Math.max(...xs) + pl.w && ty * W.tile > Math.min(...ys) && top * W.tile < Math.max(...ys) + pl.h;
      })) continue;
      cols.push({ tx, ty, top });
    }
    const pick = cols.filter((_, i) => i % Math.max(1, Math.floor(cols.length / 8)) === 0).slice(0, 8);
    const res = await sim((eb, id, cs, T) => cs.map((c) => {
      const s = PLACE(eb, id, c.tx * T + T / 2 - 12, c.top * T + 2, 240);
      return { c, s: { room: s.room, y: s.player.y, h: s.player.h, onGround: s.player.onGround } };
    }), r.id, pick, W.tile);
    for (const { c, s } of res) {
      const floor = c.ty * W.tile;
      if (s.room !== r.id) bad.push(`${r.id} col ${c.tx}: dropped into room ${s.room}`);
      else if (!s.onGround || Math.abs(s.y + s.h - floor) > 3) bad.push(`${r.id} col ${c.tx}: feet at ${Math.round(s.y + s.h)}, floor at ${floor}, onGround ${s.onGround}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('a full jump rises PHYS.jumpHeight and a tap jump less', async () => {
  const at = findFlat(4, 6);
  assert.ok(at, 'no room has a 4-tile floor with 6 open rows above');
  await G.fresh(eb);
  const T = W.tile;
  const x = (at.flat.tx0 + 1) * T, y = at.flat.ty * T - W.physics.playerH - 2;
  const r = await sim((eb, id, x, y, holdSteps) => {
    const s0 = PLACE(eb, id, x, y);
    let minY = s0.player.y, s = s0, left = false;
    eb.input({ jump: true });
    for (let i = 0; i < 180; i++) {
      if (i === holdSteps) eb.input(null);
      s = eb.step(1000 / 60, { render: false });
      minY = Math.min(minY, s.player.y);
      if (!s.player.onGround) left = true;
      else if (left) break;
    }
    eb.input(null);
    return { y0: s0.player.y, ground0: s0.player.onGround, rise: s0.player.y - minY, landed: s.player.onGround, dy: s.player.y - s0.player.y };
  }, at.room.id, x, y, 999);
  assert.ok(r.ground0, 'player not on the floor before the jump');
  assert.ok(tol(r.rise, W.physics.jumpHeight, 0.1), `full jump rose ${r.rise.toFixed(1)} px, PHYS.jumpHeight ${W.physics.jumpHeight}`);
  assert.ok(r.landed && Math.abs(r.dy) < 2, `did not land back on the same floor (dy ${r.dy})`);
  const tap = await sim((eb, id, x, y) => {
    const s0 = PLACE(eb, id, x, y);
    let minY = s0.player.y;
    eb.input({ jump: true });
    eb.step(1000 / 60, { render: false });
    eb.step(1000 / 60, { render: false });
    eb.input(null);
    for (let i = 0; i < 120; i++) minY = Math.min(minY, eb.step(1000 / 60, { render: false }).player.y);
    return s0.player.y - minY;
  }, at.room.id, x, y);
  assert.ok(tap < r.rise * 0.8 && tap > 10, `a tapped jump rose ${tap.toFixed(1)} px vs ${r.rise.toFixed(1)} held (variable jump height)`);
});

test('Twin Leap adds PHYS.doubleJumpHeight, and only with the ability', async () => {
  const at = findFlat(4, 9);
  assert.ok(at, 'no room has a 4-tile floor with 9 open rows above');
  const T = W.tile;
  const x = (at.flat.tx0 + 1) * T, y = at.flat.ty * T - W.physics.playerH - 2;
  const dj = (eb, id, x, y) => {
    const s0 = PLACE(eb, id, x, y);
    let s = s0, minY = s0.player.y, y2 = null, min2 = Infinity;
    eb.input({ jump: true });
    for (let i = 0; i < 240; i++) {
      s = eb.step(1000 / 60, { render: false });
      minY = Math.min(minY, s.player.y);
      if (y2 == null && i > 4 && s.player.vy >= 0) { eb.input(null); eb.step(1000 / 60, { render: false }); eb.input({ jump: true }); s = eb.step(1000 / 60, { render: false }); y2 = s.player.y; }
      if (y2 != null) min2 = Math.min(min2, s.player.y);
      if (y2 != null && s.player.onGround) break;
    }
    eb.input(null);
    return { first: s0.player.y - minY, gain: y2 == null ? 0 : y2 - min2, total: s0.player.y - Math.min(minY, min2) };
  };
  await G.fresh(eb);
  const without = await sim(dj, at.room.id, x, y);
  await G.fresh(eb, { abilities: ['twin-leap'] });
  await eb('god', true);
  const withIt = await sim(dj, at.room.id, x, y);
  assert.ok(without.gain < 8, `a second jump in the air worked without Twin Leap (gained ${without.gain.toFixed(1)} px)`);
  assert.ok(tol(withIt.gain, W.physics.doubleJumpHeight, 0.12), `second jump gained ${withIt.gain.toFixed(1)} px, PHYS.doubleJumpHeight ${W.physics.doubleJumpHeight}`);
  assert.ok(withIt.total > 5 * T, `double jump reach ${withIt.total.toFixed(1)} px is under the 5-tile ledges it must clear`);
  assert.ok(without.first < 4 * T, `a single jump reaches ${without.first.toFixed(1)} px, so 4-tile ledges are not a gate`);
});

test('Ember Dash covers PHYS.dashDistance, and only with the ability', async () => {
  const at = findFlat(11, 3);
  assert.ok(at, 'no room has an 11-tile floor with 3 open rows above');
  const T = W.tile;
  const x = (at.flat.tx0 + 1) * T, y = at.flat.ty * T - W.physics.playerH - 2;
  const dash = (eb, id, x, y) => {
    PLACE(eb, id, x, y);
    eb.input({ right: true }); eb.step(1000 / 60, { render: false });
    eb.input(null);
    let s;
    for (let i = 0; i < 40; i++) s = eb.step(1000 / 60, { render: false });
    const x0 = s.player.x;
    eb.input({ dash: true });
    for (let i = 0; i < 45; i++) s = eb.step(1000 / 60, { render: false });
    eb.input(null);
    return { dx: s.player.x - x0, facing: s.player.facing };
  };
  await G.fresh(eb);
  const without = await sim(dash, at.room.id, x, y);
  await G.fresh(eb, { abilities: ['ember-dash'] });
  await eb('god', true);
  const withIt = await sim(dash, at.room.id, x, y);
  assert.ok(Math.abs(without.dx) < 20, `dash moved ${without.dx.toFixed(1)} px without Ember Dash`);
  assert.ok(tol(withIt.dx, W.physics.dashDistance, 0.15), `dash moved ${withIt.dx.toFixed(1)} px, PHYS.dashDistance ${W.physics.dashDistance}`);
});

test('run speed matches PHYS.runSpeed', async () => {
  const at = findFlat(12, 3);
  assert.ok(at, 'no room has a 12-tile floor');
  await G.fresh(eb);
  const T = W.tile;
  const r = await sim((eb, id, x, y) => {
    PLACE(eb, id, x, y);
    eb.input({ right: true });
    let s;
    for (let i = 0; i < 20; i++) s = eb.step(1000 / 60, { render: false });
    const x0 = s.player.x;
    for (let i = 0; i < 30; i++) s = eb.step(1000 / 60, { render: false });
    eb.input(null);
    return (s.player.x - x0) / 0.5;
  }, at.room.id, (at.flat.tx0 + 1) * T, at.flat.ty * T - W.physics.playerH - 2);
  assert.ok(tol(r, W.physics.runSpeed, 0.1), `ran at ${r.toFixed(0)} px/s, PHYS.runSpeed ${W.physics.runSpeed}`);
});

test('gate kinds name the right ability', () => {
  const want = { ledge: 'twin-leap', gap: 'ember-dash', crack: 'ember-dash', shaft: 'root-grip', hook: 'chain-hook', lava: 'fire-form', thorn: 'fire-form' };
  const bad = [];
  const kinds = new Set();
  for (const r of W.rooms) for (const g of r.gates || []) {
    kinds.add(g.kind);
    if (want[g.kind] && want[g.kind] !== g.requires) bad.push(`${r.id}/${g.id}: ${g.kind} requires ${g.requires}`);
    if (!want[g.kind]) bad.push(`${r.id}/${g.id}: unknown gate kind ${g.kind}`);
  }
  assert.deepEqual(bad, []);
  for (const a of G.ABILITIES) assert.ok(W.rooms.some((r) => (r.gates || []).some((g) => g.requires === a)), `no gate needs ${a}`);
});

test('every gate holds without its ability and is passable with it', async () => {
  const gates = W.rooms.flatMap((r) => (r.gates || []).map((g) => ({ r, g })));
  const bad = [];
  const rows = [];
  for (const { r, g } of gates) {
    if (!g.from || !g.to) { bad.push(`${r.id}/${g.id}: no from/to standing spots in world()`); continue; }
    await G.fresh(eb, { abilities: G.ABILITIES.filter((a) => a !== g.requires) });
    await eb('god', true);
    const a = await sim(M.playGate, r.id, g, r.anchors || [], 6, false, g.requires);
    await G.fresh(eb, { abilities: G.ABILITIES });
    await eb('god', true);
    const b = await sim(M.playGate, r.id, g, r.anchors || [], 10);
    rows.push({ room: r.id, gate: g.id, kind: g.kind, without: a, with: b });
    if (!a.placed) bad.push(`${r.id}/${g.id}: could not stand at its from spot`);
    else if (a.ok) bad.push(`${r.id}/${g.id} (${g.kind}): passed without ${g.requires}`);
    if (b.placed && !b.ok) bad.push(`${r.id}/${g.id} (${g.kind}): not passed with ${g.requires} (closest ${b.best} px, ended at ${JSON.stringify(b.at || b.left)})`);
  }
  fs.writeFileSync(path.join(OUT, 'gates.json'), JSON.stringify(rows, null, 2));
  assert.deepEqual(bad, []);
});

test('lava burns without Fire Form and not with it', async () => {
  const pools = W.rooms.flatMap((r) => (r.gates || []).filter((g) => g.kind === 'lava').map((g) => ({ r, g })));
  assert.ok(pools.length, 'no lava gates in the world');
  const { r, g } = pools[0];
  const dip = (eb, id, g, fire) => {
    eb.goto(id, g.x + g.w / 2 - 12, g.y - 60);
    eb.kill(); eb.heal();
    if (fire) { eb.input({ fire: true }); eb.step(1000 / 60, { render: false }); }
    let s = eb.state(); const hp0 = s.player.hp; let minHp = hp0;
    for (let i = 0; i < 60; i++) { s = eb.step(1000 / 60, { render: false }); minHp = Math.min(minHp, s.player.hp); if (s.scene === 'dead') { minHp = 0; break; } }
    eb.input(null);
    return { hp0, minHp };
  };
  await G.fresh(eb, { abilities: G.ABILITIES.filter((a) => a !== 'fire-form') });
  await eb('god', false);
  const a = await sim(dip, r.id, g, false);
  await G.fresh(eb, { abilities: G.ABILITIES });
  await eb('god', false);
  const b = await sim(dip, r.id, g, true);
  assert.ok(a.minHp < a.hp0, `${r.id}/${g.id}: lava did not hurt without Fire Form (hp ${a.hp0} -> ${a.minHp})`);
  assert.ok(b.minHp >= b.hp0, `${r.id}/${g.id}: lava hurt in Fire Form (hp ${b.hp0} -> ${b.minHp})`);
});
