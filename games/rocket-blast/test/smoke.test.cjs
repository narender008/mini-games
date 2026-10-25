// Browser smoke tests for the kids' modes: the page loads clean and draws a
// moving frame; from the start screen each of Little Pilot, Big Kid and Free
// Blast plays and answers mouse, keyboard and touch; Big Kid's waves advance
// to the boss and past it; every mode goes back to the menu; the zoomed-out
// camera shows the field size it should; and a phone in portrait works by
// touch. Game time is driven through window.__rb's fixed steps (SwiftShader
// frames are far too slow to wait on).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, frameStats, frameDiff, canvasBox, touch, mouseTo } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

let server, browser;
before(async () => { server = await serve(process.env.RB_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual([...page.problems], [], `page reported problems:\n${page.problems.join('\n')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(3)} is not within ${tol} of ${b.toFixed(3)}`);

// The field the camera shows (src/main.js resize): at least 11 cells tall and
// 7.4 across, widened by VIEW_ZOOM 1.8.
const expectHalfH = (w, h) => (Math.max(11, 7.4 / (w / h)) * 1.8) / 2;

// From the start screen into a kids' mode, the way a player gets there.
async function playMode(page, mode, { tap = false } = {}) {
  const rb = await G.hook(page);
  await rb('freeze');
  await G.press(page, `.mode[data-mode="${mode}"]`, { tap });
  assert.equal(await page.getAttribute(`.mode[data-mode="${mode}"]`, 'aria-checked'), 'true', `${mode} card not selected`);
  await G.press(page, '#play', { tap });
  await rb('step', 100);
  const k = await G.kid(page);
  assert.equal(k.state, 'playing', `state after PLAY is ${k.state}`);
  assert.equal(k.mode, mode);
  assert.equal(k.body, 'playing');
  assert.ok(await G.visible(page, '#hud'), 'HUD hidden in play');
  return rb;
}

async function backToMenu(page, rb, { tap = false } = {}) {
  await G.press(page, '#to-menu', { tap });
  await rb('step', 100);
  const k = await G.kid(page);
  assert.equal(k.state, 'menu');
  assert.ok(await G.visible(page, '#menu'), 'menu hidden after Home');
  assert.ok(!(await G.visible(page, '#hud')), 'HUD still showing on the menu');
}

// Counts weapon shots from now on (window.__fires).
async function countFires(page) {
  await page.evaluate(() => {
    window.__fires = 0;
    for (const w of Object.values(window.__rb.app.weapons.weapons)) {
      if (w.__counted) continue;
      const f = w.fire.bind(w);
      w.fire = (...a) => { window.__fires++; return f(...a); };
      w.__counted = true;
    }
  });
}

test('page loads with no console errors, failed requests or network calls', async () => {
  const page = await open(browser, server.url);
  await sleep(1500);
  clean(page);
  assert.ok(await G.visible(page, '#menu'), 'start screen not showing');
  for (const m of ['little', 'big', 'free']) assert.ok(await G.visible(page, `.mode[data-mode="${m}"]`), `${m} mode card missing`);
  assert.ok(await G.visible(page, '#play'), 'PLAY missing');
  await close(page);
});

test('canvas renders a detailed, moving frame', async () => {
  const page = await open(browser, server.url, 'debug');
  const rb = await G.hook(page);
  const box = await canvasBox(page);
  assert.ok(box.w >= 1400 && box.h >= 880, `canvas does not fill the window: ${JSON.stringify(box)}`);
  // the real frame loop draws on its own...
  const f0 = await page.evaluate(() => window.__rb.app.time);
  await page.waitForFunction((t) => window.__rb.app.time > t + 0.05, f0, { polling: 100 });
  // ...then fixed steps: the menu scene moves between two of them
  await rb('freeze');
  await rb('step', 16);
  const a = await page.screenshot();
  const s = await frameStats(page, a);
  assert.ok(s.std > 10 && s.colours > 60, `frame looks blank or flat: ${JSON.stringify(s)}`);
  await rb('step', 800);
  const b = await page.screenshot();
  const d = await frameDiff(page, a, b);
  assert.ok(d > 0.005, `the menu scene is not animating (diff ${d})`);
  clean(page);
  await close(page);
});

test('zoomed-out camera: field is 9.9 units high at 1440x900', async () => {
  const page = await open(browser, server.url, 'debug');
  await G.hook(page);
  const k = await G.kid(page);
  near(k.field.halfH, 9.9, 0.01, 'halfH');
  near(k.field.halfW, 9.9 * 1.6, 0.02, 'halfW');
  // the camera frames exactly that field at z = 0
  const edge = await page.evaluate(() => {
    const { app, THREE } = window.__rb;
    const v = new THREE.Vector3(app.field.halfW, app.field.halfH, 0).project(app.camera);
    return { x: v.x, y: v.y };
  });
  near(edge.x, 1, 0.05, 'right edge in NDC');
  near(edge.y, 1, 0.05, 'top edge in NDC');
  await close(page);
});

test('Little Pilot: plays, follows the mouse and the keyboard, auto-fires, back to menu', async () => {
  const page = await open(browser, server.url, 'debug');
  const rb = await playMode(page, 'little');
  const audio = await page.evaluate(() => (window.__rbAudio || []).map((c) => c.state));
  assert.ok(audio.length > 0, 'no AudioContext after PLAY');
  // mouse: the rocket flies to the pointer (mouse has no finger lift)
  const k0 = await G.kid(page);
  const target = { x: k0.rocket.x > 0 ? -6 : 6, y: -5 };
  const p = await G.toScreen(page, target.x, target.y);
  await mouseTo(page, p.x, p.y);
  await rb('step', 1500);
  let k = await G.kid(page);
  assert.equal(k.pointer.type, 'mouse');
  near(k.rocket.x, target.x, 1, 'rocket x after mouse move');
  // keyboard: holding ArrowRight flies right
  const x0 = k.rocket.x;
  await page.keyboard.down('ArrowRight');
  await rb('step', 600);
  await page.keyboard.up('ArrowRight');
  k = await G.kid(page);
  assert.ok(k.rocket.x > x0 + 2, `ArrowRight moved the rocket from ${x0.toFixed(2)} to ${k.rocket.x.toFixed(2)}`);
  // auto-fire with no button held, and toys appear and can be blasted
  await countFires(page);
  await rb('step', 3000);
  assert.ok(await page.evaluate(() => window.__fires) > 0, 'Little Pilot did not auto-fire');
  k = await G.kid(page);
  assert.ok(k.enemies > 0, 'no toys in the sky after 4.5 s');
  const s0 = k.score;
  assert.equal(await rb('hitFirst'), true);
  await rb('step', 200);
  assert.ok((await G.kid(page)).score > s0, 'blasting a toy did not score');
  await backToMenu(page, rb);
  clean(page);
  await close(page);
});

test('Big Kid: fires while held, waves advance through the boss, back to menu', async () => {
  const page = await open(browser, server.url, 'debug');
  const rb = await playMode(page, 'big');
  assert.ok(await G.visible(page, '#wave-box'), 'wave counter hidden in Big Kid');
  await countFires(page);
  // no button: no fire
  await rb('step', 1000);
  assert.equal(await page.evaluate(() => window.__fires), 0, 'Big Kid fired with nothing held');
  // mouse held on the field: fire
  const c = await G.toScreen(page, 0, -4);
  await mouseTo(page, c.x, c.y);
  await page.mouse.down();
  await rb('step', 1000);
  await page.mouse.up();
  assert.ok(await page.evaluate(() => window.__fires) > 0, 'Big Kid did not fire with the mouse held');
  // Space held: fire too
  await page.evaluate(() => { window.__fires = 0; });
  await page.keyboard.down(' ');
  await rb('step', 800);
  await page.keyboard.up(' ');
  assert.ok(await page.evaluate(() => window.__fires) > 0, 'Big Kid did not fire with Space held');
  // keyboard flies the rocket
  let k = await G.kid(page);
  await page.keyboard.down('ArrowLeft');
  await rb('step', 600);
  await page.keyboard.up('ArrowLeft');
  assert.ok((await G.kid(page)).rocket.x < k.rocket.x - 2, 'ArrowLeft did not move the rocket');
  // waves: blast everything as it comes until wave 4 (wave 3 has the boss)
  const seen = { waves: [1], boss: false };
  for (let slice = 0; slice < 60 && seen.waves[seen.waves.length - 1] < 4; slice++) {
    const r = await page.evaluate(() => {
      // 25 sim seconds without drawing: blast the first toy every 0.2 s
      const rb = window.__rb, app = rb.app, d = app.director;
      const out = { waves: [], boss: false };
      for (let i = 0; i < 125 && d.wave < 4; i++) {
        if (d.boss) out.boss = true;
        rb.hitFirst();
        for (let k = 0; k < 12; k++) app.update(1 / 60, 1 / 60);
        out.waves.push(d.wave);
      }
      app.render();
      return out;
    });
    seen.boss ||= r.boss;
    for (const w of r.waves) if (seen.waves[seen.waves.length - 1] !== w) seen.waves.push(w);
  }
  assert.ok(seen.waves.includes(2) && seen.waves.includes(3) && seen.waves.includes(4), `waves seen: ${seen.waves.join(',')}`);
  assert.ok(seen.boss, 'no boss on wave 3');
  assert.equal(await page.textContent('#wave'), '4');
  assert.ok((await G.kid(page)).score > 0, 'no score after three waves');
  await backToMenu(page, rb);
  clean(page);
  await close(page);
});

test('Free Blast: a tap blasts the toy under the finger, then back to menu', async () => {
  const page = await open(browser, server.url, 'debug', { touch: true });
  const rb = await playMode(page, 'free', { tap: true });
  await rb('step', 3000);
  const toy = await page.evaluate(() => {
    const e = window.__rb.app.enemies.find((e) => e.alive && Math.abs(e.x) < 10 && Math.abs(e.y) < 7);
    return e && { x: e.x, y: e.y };
  });
  assert.ok(toy, 'no toy on the field to tap');
  const before = await page.evaluate(() => window.__rb.app.director.hits);
  const p = await G.toScreen(page, toy.x, toy.y);
  await page.touchscreen.tap(p.x, p.y);
  await rb('step', 300);
  const k = await G.kid(page);
  const hits = await page.evaluate(() => window.__rb.app.director.hits);
  assert.equal(k.pointer.type, 'touch');
  assert.ok(hits > before, `tapping a toy did not blast it (hits ${before} -> ${hits})`);
  // a drag across the field blasts along the way
  const t = await touch(page);
  await t.down(200, 300);
  for (let i = 1; i <= 8; i++) { await t.move(200 + i * 120, 300 + i * 30); await rb('step', 50); }
  await t.up();
  await t.detach();
  const dragged = await page.evaluate(() => window.__rb.app.director.hits);
  assert.ok(dragged >= hits, 'drag lost hits');
  await backToMenu(page, rb, { tap: true });
  clean(page);
  await close(page);
});

test('touch: the rocket follows a dragged finger, lifted above it', async () => {
  const page = await open(browser, server.url, 'debug', { touch: true });
  const rb = await playMode(page, 'little', { tap: true });
  const t = await touch(page);
  const a = await G.toScreen(page, -4, -7);
  const b = await G.toScreen(page, 5, -7);
  await t.down(a.x, a.y);
  await rb('step', 100);
  for (let i = 1; i <= 6; i++) { await t.move(a.x + ((b.x - a.x) * i) / 6, a.y); await rb('step', 100); }
  await rb('step', 1500);
  const k = await G.kid(page);
  await t.up();
  await t.detach();
  assert.equal(k.pointer.type, 'touch');
  near(k.rocket.x, 5, 1, 'rocket x under the finger');
  assert.ok(k.rocket.y > -7 + 1, `rocket not lifted above the finger (y ${k.rocket.y.toFixed(2)})`);
  clean(page);
  await close(page);
});

test('phone portrait 390x844: menu fits, plays by touch, back to menu', async () => {
  const page = await open(browser, server.url, 'debug', { width: 390, height: 844, touch: true, mobile: true });
  const rb = await G.hook(page);
  await rb('freeze');
  const layout = await page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    return { scrollW: document.documentElement.scrollWidth, play: r('#play'), modes: ['little', 'big', 'free'].map((m) => r(`.mode[data-mode="${m}"]`)) };
  });
  assert.ok(layout.scrollW <= 390, `page scrolls sideways (${layout.scrollW}px wide)`);
  for (const b of [layout.play, ...layout.modes]) {
    assert.ok(b.l >= 0 && b.r <= 390 && b.t >= 0 && b.b <= 844, `control off screen: ${JSON.stringify(b)}`);
    assert.ok(b.w >= 44 && b.h >= 44, `touch target under 44px: ${JSON.stringify(b)}`);
  }
  const k0 = await G.kid(page);
  near(k0.field.halfH, expectHalfH(390, 844), 0.02, 'portrait halfH');
  await playMode(page, 'little', { tap: true });
  const t = await touch(page);
  const a = await G.toScreen(page, 0, -10);
  await t.down(a.x, a.y);
  for (let i = 1; i <= 5; i++) { await t.move(a.x - i * 30, a.y); await rb('step', 100); }
  await rb('step', 1200);
  await t.up();
  await t.detach();
  const k = await G.kid(page);
  assert.ok(k.rocket.x < -1.5, `rocket did not follow the finger left (x ${k.rocket.x.toFixed(2)})`);
  const s = await frameStats(page);
  assert.ok(s.std > 10 && s.colours > 60, `portrait frame looks blank: ${JSON.stringify(s)}`);
  await backToMenu(page, rb, { tap: true });
  clean(page);
  await close(page);
});
