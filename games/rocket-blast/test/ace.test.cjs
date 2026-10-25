// Browser tests for Ace Pilot, the 12+ campaign (src/ace/): the mode card and
// the sector map; flying by mouse, keyboard and touch drag; EMP; pause; the
// upgrade pick after a wave; losing and retrying; a whole sector flown by the
// built-in autopilot to its result screen and saved progress; every sector's
// backdrop and boss; and renderer load in a busy boss fight. Time is driven
// with window.__rb.ace.step (see debugApi() in src/ace/ace.js).
//
// While some Ace module is not written yet every test here skips and names
// what is missing; once they all exist the tests run for real.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, frameStats, touch } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const missing = G.aceMissing();
const skip = missing.length ? `Ace Pilot modules not landed yet: ${missing.join(', ')}` : false;
if (skip) console.log(`# SKIP ${skip}`);

let server, browser;
before(async () => { if (skip) return; server = await serve(process.env.RB_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual([...page.problems], [], `page reported problems:\n${page.problems.join('\n')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fresh page with the Ace hook loaded and the app's own frame loop frozen,
// so only ace.step moves time.
async function acePage(query = '', opts) {
  const page = await open(browser, server.url, `debug&mode=ace&seed=7${query}`, opts);
  const ace = await G.ace(page);
  await ace('freeze');
  return { page, ace };
}

// Straight into sector n, past the intro into the first wave.
async function inSector(page, ace, n = 1, { wave = true } = {}) {
  await page.evaluate((n) => { window.__rb.ace.play(n); }, n);
  let s = await G.aceState(page);
  assert.equal(s.screen, 'play', `screen after play(${n})`);
  assert.equal(s.sector, n);
  if (wave) s = await G.aceUntil(page, (S) => S.phase === 'wave' && S.enemies.length > 0, { maxSec: 20, sliceMs: 100 });
  return s;
}

test('Ace card on the menu; PLAY opens the sector map; launch shows the HUD', { skip }, async () => {
  const page = await open(browser, server.url, 'debug');
  const ace = await G.hook(page);
  await ace('freeze');
  assert.ok(await G.visible(page, '.mode[data-mode="ace"]'), 'no Ace Pilot mode card');
  assert.match(await page.textContent('.mode[data-mode="ace"]'), /Ace Pilot/);
  assert.match(await page.textContent('.mode[data-mode="ace"]'), /12\+/);
  await G.press(page, '.mode[data-mode="ace"]');
  assert.equal(await page.getAttribute('.mode[data-mode="ace"]', 'aria-checked'), 'true');
  assert.ok(!(await G.visible(page, '#menu .pickers')), 'kids\' pickers still showing with Ace selected');
  await G.press(page, '#play');
  await G.waitVisible(page, '#ace-map', 60000);
  await page.waitForFunction(() => window.__rb.ace, null, { timeout: 30000 }).catch(() => page.evaluate(() => window.__rb.loadAce()));
  await G.ace(page);
  assert.equal(await page.evaluate(() => window.__rb.ace.screen()), 'map');
  assert.equal(await page.locator('.ace-sector[data-id]').count(), 5, 'sector map should list 5 sectors');
  await G.press(page, '#ace-launch');
  await G.waitVisible(page, '#ace-hud');
  const s = await G.aceState(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.sector, 1);
  assert.ok(!(await G.visible(page, '#ace-map')), 'map still showing in flight');
  assert.ok(!(await G.visible(page, '#hud')), 'kids\' HUD showing in Ace');
  assert.ok(await G.visible(page, '#ace-emp'), 'no EMP button');
  assert.ok(await G.visible(page, '#ace-pause'), 'no pause button');
  await page.evaluate(() => window.__rb.ace.step(1500));
  clean(page);
  await close(page);
});

test('?mode=ace&sector=2&play starts straight into sector 2', { skip }, async () => {
  const page = await open(browser, server.url, 'debug&mode=ace&sector=2&play&seed=3');
  await G.ace(page);
  await page.waitForFunction(() => window.__rb.ace.screen() === 'play', null, { timeout: 30000 });
  const s = await G.aceState(page);
  assert.equal(s.sector, 2);
  assert.ok(await G.visible(page, '#ace-hud'));
  clean(page);
  await close(page);
});

test('the fighter flies to the mouse and by keyboard', { skip }, async () => {
  const { page, ace } = await acePage();
  let s = await inSector(page, ace, 1);
  const f = s.field;
  // mouse at 75% across, 80% down: world (0.5 halfW, -0.6 halfH)
  const tx = 0.5 * f.halfW, ty = -0.6 * f.halfH;
  await page.mouse.move(1440 * 0.75, 900 * 0.8, { steps: 3 });
  await page.evaluate(() => window.__rb.ace.step(1500, { render: false }));
  s = await G.aceState(page);
  assert.ok(Math.abs(s.player.x - tx) < 1.2 && Math.abs(s.player.y - ty) < 1.2, `fighter at (${s.player.x.toFixed(2)}, ${s.player.y.toFixed(2)}), mouse at (${tx.toFixed(2)}, ${ty.toFixed(2)})`);
  // keyboard: ArrowLeft / A fly left, ArrowUp flies up
  const x0 = s.player.x, y0 = s.player.y;
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => window.__rb.ace.step(600, { render: false }));
  await page.keyboard.up('ArrowLeft');
  s = await G.aceState(page);
  assert.ok(s.player.x < x0 - 2, `ArrowLeft: x ${x0.toFixed(2)} -> ${s.player.x.toFixed(2)}`);
  await page.keyboard.down('w');
  await page.evaluate(() => window.__rb.ace.step(300, { render: false }));
  await page.keyboard.up('w');
  const s2 = await G.aceState(page);
  assert.ok(s2.player.y > s.player.y + 0.5, `W: y ${s.player.y.toFixed(2)} -> ${s2.player.y.toFixed(2)}`);
  // and stays in the lower part of the field
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => window.__rb.ace.step(2500, { render: false }));
  await page.keyboard.up('ArrowUp');
  s = await G.aceState(page);
  assert.ok(s.player.y < 0.2 * f.halfH, `fighter flew up to y ${s.player.y.toFixed(2)} (half height ${f.halfH.toFixed(2)})`);
  assert.ok(s.shots > 0 || s.score > 0, 'the guns never fired');
  clean(page);
  await close(page);
});

test('touch: the fighter follows a drag, keeping its offset from the finger', { skip }, async () => {
  const { page, ace } = await acePage('', { width: 1280, height: 800, touch: true });
  let s = await inSector(page, ace, 1);
  const f = s.field;
  const px = (x) => (x / f.halfW * 0.5 + 0.5) * 1280;
  const py = (y) => (-y / f.halfH * 0.5 + 0.5) * 800;
  const t = await touch(page);
  // finger down below and left of the fighter
  const fx = px(s.player.x - 2), fy = py(s.player.y - 2);
  await t.down(fx, fy);
  await page.evaluate(() => window.__rb.ace.step(100, { render: false }));
  const start = await G.aceState(page);
  const off = { x: start.player.x - ((fx / 1280) * 2 - 1) * f.halfW };
  const dx = 260;
  for (let i = 1; i <= 6; i++) { await t.move(fx + (dx * i) / 6, fy); await page.evaluate(() => window.__rb.ace.step(80, { render: false })); }
  await page.evaluate(() => window.__rb.ace.step(1200, { render: false }));
  s = await G.aceState(page);
  await t.up();
  await t.detach();
  const want = (((fx + dx) / 1280) * 2 - 1) * f.halfW + off.x;
  assert.ok(s.player.x > start.player.x + 3, `drag right: x ${start.player.x.toFixed(2)} -> ${s.player.x.toFixed(2)}`);
  assert.ok(Math.abs(s.player.x - want) < 1.2, `fighter at x ${s.player.x.toFixed(2)}, finger + offset at ${want.toFixed(2)} (relative drag)`);
  clean(page);
  await close(page);
});

test('EMP: right click, X and the EMP button each use a charge', { skip }, async () => {
  const { page, ace } = await acePage();
  let s = await inSector(page, ace, 1);
  const e0 = s.player.emp;
  assert.ok(e0 >= 2, `fighter starts with ${e0} EMPs, expected 2`);
  const step = (ms) => page.evaluate((ms) => window.__rb.ace.step(ms, { render: false }), ms);
  await page.keyboard.press('x');
  await step(300);
  s = await G.aceState(page);
  assert.equal(s.player.emp, e0 - 1, 'X did not fire an EMP');
  await step(1500);
  await page.mouse.click(720, 600, { button: 'right' });
  await step(300);
  s = await G.aceState(page);
  assert.equal(s.player.emp, e0 - 2, 'right click did not fire an EMP');
  // EMP Charge gives one back; the HUD button spends it
  await page.evaluate(() => window.__rb.ace.upgrade('emp', 1));
  s = await G.aceState(page);
  assert.equal(s.player.emp, e0 - 1, 'EMP Charge upgrade did not add a charge');
  await step(1500);
  await G.press(page, '#ace-emp');
  await step(300);
  s = await G.aceState(page);
  assert.equal(s.player.emp, e0 - 2, '#ace-emp did not fire an EMP');
  assert.equal(s.bullets, 0, 'enemy bullets survived the EMP');
  clean(page);
  await close(page);
});

test('pause: Esc and the pause button stop the sim; resume carries on', { skip }, async () => {
  const { page, ace } = await acePage();
  await inSector(page, ace, 1);
  await page.keyboard.press('Escape');
  await G.waitVisible(page, '#ace-paused', 5000);
  let s = await G.aceState(page);
  assert.equal(s.screen, 'paused');
  const t0 = s.time;
  await page.evaluate(() => window.__rb.ace.step(1000, { render: false }));
  assert.equal((await G.aceState(page)).time, t0, 'sim time moved while paused');
  await G.press(page, '#ace-resume');
  await page.evaluate(() => window.__rb.ace.step(500, { render: false }));
  s = await G.aceState(page);
  assert.equal(s.screen, 'play');
  assert.ok(!(await G.visible(page, '#ace-paused')), 'pause screen still showing');
  assert.ok(s.time > t0 + 0.3, 'sim did not resume');
  // the HUD's pause button, then Esc to resume
  await G.press(page, '#ace-pause');
  await G.waitVisible(page, '#ace-paused', 5000);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__rb.ace.step(100, { render: false }));
  assert.equal((await G.aceState(page)).screen, 'play', 'Esc did not resume');
  clean(page);
  await close(page);
});

test('an upgrade offer follows wave 1; reroll and a click on a card apply', { skip }, async () => {
  const { page, ace } = await acePage();
  await inSector(page, ace, 1);
  await page.evaluate(() => window.__rb.ace.god(true));
  const s = await G.aceUntil(page, (S, screen) => screen === 'upgrade', { maxSec: 180, sliceMs: 250, killEach: true });
  assert.equal(s.phase, 'upgrade');
  assert.equal(s.wave, 1, 'the first offer should come after wave 1');
  await G.waitVisible(page, '#ace-upgrade', 5000);
  assert.equal(await page.locator('#ace-upgrade .ace-card[data-id]').count(), 3, 'expected 3 upgrade cards');
  const ids = await page.$$eval('#ace-upgrade .ace-card[data-id]', (els) => els.map((e) => e.dataset.id));
  assert.deepEqual(ids, s.offer.map((o) => o.id), 'cards do not match the sim offer');
  await sleep(600); // the cards ignore clicks for a moment after they appear
  if (s.rerolls > 0 && (await G.visible(page, '#ace-reroll'))) {
    await G.press(page, '#ace-reroll');
    await sleep(600);
    const r = await G.aceState(page);
    assert.equal(r.rerolls, s.rerolls - 1, 'reroll not spent');
    const ids2 = await page.$$eval('#ace-upgrade .ace-card[data-id]', (els) => els.map((e) => e.dataset.id));
    assert.deepEqual(ids2, r.offer.map((o) => o.id), 'cards not redrawn after reroll');
  }
  const offer = (await G.aceState(page)).offer.map((o) => o.id);
  const id = offer.find((x) => x !== 'repair') ?? offer[0];
  // a click picks the card, Take (or a second click) takes it
  await G.press(page, `#ace-upgrade .ace-card[data-id="${id}"]`);
  assert.equal(await page.getAttribute(`#ace-upgrade .ace-card[data-id="${id}"]`, 'aria-checked'), 'true', 'card not selected by a click');
  await G.press(page, '#ace-take');
  await page.evaluate(() => window.__rb.ace.step(200, { render: false }));
  const after = await G.aceState(page);
  assert.equal(after.screen, 'play');
  assert.ok(!(await G.visible(page, '#ace-upgrade')), 'upgrade screen still showing');
  if (id !== 'repair') assert.ok(after.upgrades[id] >= 1, `picked ${id} but upgrades are ${JSON.stringify(after.upgrades)}`);
  assert.ok(await G.visible(page, '#ace-hud'));
  clean(page);
  await close(page);
});

test('losing: hull 0 shows the fail result; retry restarts the sector', { skip }, async () => {
  const { page, ace } = await acePage();
  await inSector(page, ace, 1);
  await page.evaluate(() => window.__rb.ace.god(false));
  // wait for the first enemy bullet, then keep parking copies of it on the fighter
  await G.aceUntil(page, (S) => S.bullets.length > 0, { maxSec: 30, sliceMs: 100 });
  const s = await page.evaluate(() => {
    const A = window.__rb.ace;
    for (let i = 0; i < 400; i++) {
      const S = A.state();
      if (S.phase === 'dead') break;
      const p = S.player;
      p.invuln = 0;
      p.shield = 0;
      p.shields = 0;
      const b = S.bullets[0];
      if (b) S.bullets.push({ ...b, x: p.x, y: p.y, vx: 0, vy: 0, t: 0 });
      A.step(50, { render: false });
    }
    return { phase: A.state().phase, hull: A.state().player.hull };
  });
  assert.equal(s.phase, 'dead', `fighter did not die (hull ${s.hull})`);
  await G.aceUntil(page, (S, screen) => screen === 'result', { maxSec: 6, sliceMs: 100 });
  await G.waitVisible(page, '#ace-result', 5000);
  assert.ok(await G.visible(page, '#ace-retry'), 'no retry button on the fail screen');
  assert.ok(!(await G.visible(page, '#ace-next')), 'next sector offered after a loss');
  await G.press(page, '#ace-retry');
  await page.evaluate(() => window.__rb.ace.step(200, { render: false }));
  const r = await G.aceState(page);
  assert.equal(r.screen, 'play');
  assert.notEqual(r.phase, 'dead');
  assert.equal(r.player.hull, r.player.hullMax, 'retry did not restore the hull');
  assert.ok(!(await G.visible(page, '#ace-result')), 'result screen still showing after retry');
  clean(page);
  await close(page);
});

test('autopilot clears sector 1: result screen, rank and saved unlock', { skip }, async () => {
  const { page, ace } = await acePage();
  await page.evaluate(() => { window.__rb.ace.resetProgress(); });
  await inSector(page, ace, 1, { wave: false });
  await page.evaluate(() => { window.__rb.ace.auto(true); window.__rb.ace.god(true); });
  const t0 = Date.now();
  const s = await G.aceUntil(page, (S) => S.phase === 'cleared', { maxSec: 900, sliceMs: 1000 });
  const wall = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`# sector 1 cleared by the autopilot in ${s.time.toFixed(0)} s of sim time (${wall} s wall), score ${s.score}, rank ${s.rank}`);
  assert.ok(s.time > 120 && s.time < 900, `sector 1 took ${s.time.toFixed(0)} s of sim time (brief: about 5 to 7 minutes)`);
  await G.aceUntil(page, (S, screen) => screen === 'result', { maxSec: 8, sliceMs: 100 });
  await G.waitVisible(page, '#ace-result', 5000);
  assert.ok(await G.visible(page, '#ace-next'), 'no next-sector button after a win');
  assert.ok(['S', 'A', 'B', 'C'].includes(s.rank), `rank ${s.rank}`);
  const saved = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), G.ACE_KEY));
  assert.ok(saved && saved.unlocked >= 2, `progress not saved under ${G.ACE_KEY}: ${JSON.stringify(saved)}`);
  assert.ok(Object.values(saved.rank || {}).length >= 1, `no rank saved: ${JSON.stringify(saved)}`);
  await G.press(page, '#ace-tomap');
  await G.waitVisible(page, '#ace-map', 5000);
  clean(page);
  await close(page);
});

test('every sector loads its backdrop and its boss', { skip }, async () => {
  const { page, ace } = await acePage();
  const worlds = [];
  for (let n = 1; n <= 5; n++) {
    await page.evaluate((n) => { window.__rb.ace.play(n, { boss: true }); }, n);
    await page.waitForFunction(() => { const a = window.__rb.app; return a.worldId?.startsWith('ace:') && a.world === a.worlds[a.worldId]; }, null, { timeout: 60000 });
    const s = await G.aceUntil(page, (S) => !!S.boss && S.boss.parts.length > 0, { maxSec: 20, sliceMs: 250 });
    await page.evaluate(() => window.__rb.ace.step(2500, { render: false }));
    await page.evaluate(() => window.__rb.ace.step(16, { render: true }));
    const s2 = await G.aceState(page);
    assert.ok(s2.boss, `sector ${n}: no boss`);
    assert.ok(s2.boss.maxHp > 0 && s2.boss.name, `sector ${n}: boss without name or hp ${JSON.stringify(s2.boss)}`);
    worlds.push(s2.world);
    const st = await frameStats(page);
    assert.ok(st.std > 6 && st.colours > 40, `sector ${n} frame looks blank: ${JSON.stringify(st)}`);
    assert.deepEqual([...page.problems], [], `sector ${n} (${s.boss.name}):\n${page.problems.join('\n')}`);
  }
  assert.equal(new Set(worlds).size, 5, `sectors share backdrops: ${worlds.join(', ')}`);
  await close(page);
});

test('renderer load stays sane in a busy boss fight', { skip }, async () => {
  const { page, ace } = await acePage();
  // the final boss with the fighter parked (god mode, no autopilot): its
  // bullets pile up, then the autopilot joins in for shots, drones and blasts
  await page.evaluate(() => { const A = window.__rb.ace; A.play(5, { boss: true }); A.god(true); A.auto(false); });
  await page.waitForFunction(() => { const a = window.__rb.app; return a.world === a.worlds[a.worldId]; }, null, { timeout: 60000 });
  let worst = null, busiest = 0;
  for (let i = 0; i < 8; i++) {
    if (i === 4) await page.evaluate(() => window.__rb.ace.auto(true));
    await page.evaluate(() => window.__rb.ace.step(2000, { render: false }));
    await page.evaluate(() => window.__rb.ace.step(16, { render: true }));
    const info = await G.renderInfo(page);
    const s = await G.aceState(page);
    Object.assign(info, { bullets: s.bullets, enemies: s.enemies, shots: s.shots, bossPhase: s.boss?.phase });
    busiest = Math.max(busiest, s.bullets);
    if (!worst || info.calls > worst.calls || info.triangles > worst.triangles) worst = info;
  }
  console.log(`# heaviest boss frame: ${JSON.stringify(worst)}; most enemy bullets on screen: ${busiest}`);
  assert.ok(busiest >= 20, `the boss fight never got busy (at most ${busiest} bullets)`);
  assert.ok(worst.calls <= 400, `too many draw calls: ${worst.calls}`);
  assert.ok(worst.triangles <= 3e6, `too many triangles: ${worst.triangles}`);
  assert.ok(worst.programs == null || worst.programs <= 200, `too many shader programs: ${worst.programs}`);
  clean(page);
  await close(page);
});

test('back to the menu from the sector map; kids\' modes still work after Ace', { skip }, async () => {
  const { page, ace } = await acePage();
  await inSector(page, ace, 1);
  await page.keyboard.press('Escape');
  await G.waitVisible(page, '#ace-paused', 5000);
  // quit to the map, then out to the menu
  const quit = await page.$('#ace-paused [data-action="quit"], #ace-quit, #ace-paused button:has-text("map")');
  assert.ok(quit, 'no quit-to-map button on the pause screen');
  await quit.click({ force: true });
  await G.waitVisible(page, '#ace-map', 5000);
  const back = await page.$('#ace-map [data-action="back"], #ace-back, #ace-map button:has-text("Menu"), #ace-map button:has-text("Back")');
  assert.ok(back, 'no back-to-menu button on the map');
  await back.click({ force: true });
  await G.waitVisible(page, '#menu', 5000);
  assert.ok(!(await G.visible(page, '#ace-hud')) && !(await G.visible(page, '#ace-map')), 'Ace screens left over on the menu');
  await G.press(page, '.mode[data-mode="big"]');
  await G.press(page, '#play');
  await page.evaluate(() => window.__rb.step(500));
  const k = await G.kid(page);
  assert.equal(k.state, 'playing');
  assert.equal(k.mode, 'big');
  assert.equal(await page.evaluate(() => window.__rb.app.rocket.root.visible), true, 'kids\' rocket still hidden');
  clean(page);
  await close(page);
});

test('phone portrait 390x844: map, launch, touch flight and HUD buttons', { skip }, async () => {
  const W = 390, H = 844;
  const page = await open(browser, server.url, 'debug&mode=ace&seed=5', { width: W, height: H, touch: true, mobile: true });
  const rb = await G.hook(page);
  await rb('freeze');
  await G.press(page, '#play', { tap: true });
  await G.waitVisible(page, '#ace-map', 60000);
  await G.ace(page);
  const box = (sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; }, sel);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= W, 'map scrolls sideways');
  await G.press(page, '.ace-sector[data-id="belt"]', { tap: true });
  await G.press(page, '#ace-launch', { tap: true });
  await G.waitVisible(page, '#ace-hud');
  let s = await G.aceState(page);
  assert.equal(s.screen, 'play');
  for (const sel of ['#ace-emp', '#ace-pause']) {
    const b = await box(sel);
    assert.ok(b.l >= 0 && b.r <= W && b.t >= 0 && b.b <= H, `${sel} off screen: ${JSON.stringify(b)}`);
    assert.ok(b.w >= 44 && b.h >= 44, `${sel} touch target under 44px: ${JSON.stringify(b)}`);
  }
  s = await G.aceUntil(page, (S) => S.phase === 'wave', { maxSec: 20, sliceMs: 100 });
  const f = s.field;
  const t = await touch(page);
  const fx = W / 2, fy = H * 0.85;
  await t.down(fx, fy);
  await page.evaluate(() => window.__rb.ace.step(100, { render: false }));
  const a = await G.aceState(page);
  for (let i = 1; i <= 5; i++) { await t.move(fx - i * 24, fy); await page.evaluate(() => window.__rb.ace.step(80, { render: false })); }
  await page.evaluate(() => window.__rb.ace.step(1000, { render: false }));
  await t.up();
  await t.detach();
  const b = await G.aceState(page);
  const want = a.player.x - (120 / W) * 2 * f.halfW;
  assert.ok(Math.abs(b.player.x - want) < 1, `finger moved 120px left: fighter ${a.player.x.toFixed(2)} -> ${b.player.x.toFixed(2)}, wanted ${want.toFixed(2)}`);
  await G.press(page, '#ace-pause', { tap: true });
  await G.waitVisible(page, '#ace-paused', 5000);
  const r = await box('#ace-resume');
  assert.ok(r.w >= 44 && r.h >= 44 && r.b <= H, `resume button: ${JSON.stringify(r)}`);
  clean(page);
  await close(page);
});
