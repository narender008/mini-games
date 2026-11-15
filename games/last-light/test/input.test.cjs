// Real keyboard and mouse input against the built game: title navigation, WASD movement, wall collision,
// mouse attack on the training dummy, dash, pause, menus not leaking input, and aim after a resize.
// Where timing matters the sim is frozen and advanced with __lt.step(ms); the input itself is real events.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, open, close, hook, until, player, shot, playing } = require('./lib/browser.cjs');

let env;
test.before(async () => { env = await setup(); });
test.after(async () => { await env.done(); });

/** Screen (CSS px) position of a world point. */
const toScreen = (page, x, y) => page.evaluate(([x, y]) => window.__lt.scene.worldToScreen(x, y), [x, y]);
const dummy = (page) => page.evaluate(() => { const e = window.__lt.world().enemies.find((e) => e.kind === 'dummy'); return e && { x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp }; });

/** Starts a run from the title with the keyboard and freezes the sim. */
async function startFrozen(page, lt) {
  await page.waitForTimeout(300); // the title ignores input for a moment after opening
  await page.keyboard.press('Enter');
  await until(async () => playing(await lt('state')), 30000, 100, 'play');
  await lt('freeze');
}

test('title menu: arrow keys move focus, Esc returns from a submenu, Enter on Begin Descent starts the run', async () => {
  const page = await open(env.browser, env.base, 'debug&seed=3');
  const lt = await hook(page);
  const focus = () => page.evaluate(() => document.activeElement?.dataset.id);
  await page.waitForTimeout(300);
  assert.equal(await focus(), 'start');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focus(), 'settings');
  await page.keyboard.press('KeyS');
  assert.equal(await focus(), 'controls');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focus(), 'start', 'focus wraps around');
  await page.keyboard.press('ArrowUp');
  assert.equal(await focus(), 'controls');
  await page.keyboard.press('Enter');
  await until(async () => (await lt('state')).screen === 'controls', 5000, 100, 'controls screen');
  await page.keyboard.press('Escape');
  await until(async () => (await lt('state')).screen === 'title', 5000, 100, 'back to title');
  assert.equal((await lt('state')).phase, 'title');
  // Back on the title, focus returns to the remembered item; go up to Begin Descent.
  while (await focus() !== 'start') await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  const s = await until(async () => { const s = await lt('state'); return playing(s) && s; }, 30000, 100, 'play');
  assert.equal(s.screen, null);
  assert.equal(s.kind, 'sanctum');
  assert.deepEqual(page.problems, []);
  await close(page);
});

test('WASD moves the keeper (real key holds; the frozen sim is stepped while each key is down)', async () => {
  const page = await open(env.browser, env.base, 'debug&play&seed=3');
  const lt = await hook(page);
  await until(async () => playing(await lt('state')), 30000);
  await lt('freeze');
  const moves = { KeyD: [1, 0], KeyA: [-1, 0], KeyW: [0, -1], KeyS: [0, 1] };
  for (const [key, [dx, dy]] of Object.entries(moves)) {
    const a = await player(page);
    await page.keyboard.down(key);
    await lt('step', 500);
    await page.keyboard.up(key);
    await lt('step', 200);
    const b = await player(page);
    const mx = b.x - a.x, my = b.y - a.y;
    assert.ok(mx * dx + my * dy > 30, `${key}: moved ${mx.toFixed(1)},${my.toFixed(1)}`);
    assert.ok(Math.abs(dx ? my : mx) < 4, `${key}: drifted sideways ${mx.toFixed(1)},${my.toFixed(1)}`);
  }
  // Released keys stop the keeper.
  const c = await player(page);
  await lt('step', 400);
  const d = await player(page);
  assert.ok(Math.hypot(d.x - c.x, d.y - c.y) < 0.5, 'kept moving after release');
  // And unfrozen, in real time, a held key moves the keeper too.
  await lt('thaw');
  await page.keyboard.down('KeyD');
  await until(async () => (await player(page)).x > d.x + 10, 10000, 100, 'real-time movement');
  await page.keyboard.up('KeyD');
  assert.deepEqual(page.problems, []);
  await close(page);
});

test('walls: holding A into the west wall stops the keeper outside it', async () => {
  const page = await open(env.browser, env.base, 'debug&play&seed=3');
  const lt = await hook(page);
  await until(async () => playing(await lt('state')), 30000);
  await lt('freeze');
  await page.keyboard.down('KeyA');
  const xs = [];
  for (let i = 0; i < 8; i++) { await lt('step', 500); xs.push((await player(page)).x); }
  await page.keyboard.up('KeyA');
  const info = await page.evaluate(() => {
    const w = window.__lt.world(), p = w.player, g = w.room.grid;
    const ty = Math.floor(p.y / 16);
    let wall = Math.floor(p.x / 16);
    while (wall >= 0 && !g.blocksMove(wall, ty)) wall--;
    return { x: p.x, r: p.r, wallRight: (wall + 1) * 16, inside: g.blocksMove(Math.floor(p.x / 16), ty) };
  });
  assert.ok(xs[0] > xs[xs.length - 1] + 30, `did not walk west: ${xs.map((x) => x.toFixed(0))}`);
  assert.equal(xs[xs.length - 1], xs[xs.length - 2], 'still moving after 4 s against the wall');
  assert.equal(info.inside, false);
  assert.ok(info.x >= info.wallRight + info.r - 0.5, `keeper at ${info.x}, wall face at ${info.wallRight}`);
  assert.deepEqual(page.problems, []);
  await close(page);
});

test('a real mouse click swings the lantern and damages the training dummy; Space dashes', async () => {
  const page = await open(env.browser, env.base, 'debug&seed=3');
  const lt = await hook(page);
  await startFrozen(page, lt);
  const d = await dummy(page);
  assert.ok(d, 'no training dummy in the sanctum');
  // Walk (with the keyboard) to just south of the dummy.
  for (let i = 0; i < 40; i++) {
    const p = await player(page);
    const dy = p.y - (d.y + 22), dx = p.x - d.x;
    if (Math.abs(dy) < 4 && Math.abs(dx) < 4) break;
    const keys = [];
    if (dx > 3) keys.push('KeyA'); else if (dx < -3) keys.push('KeyD');
    if (dy > 3) keys.push('KeyW'); else if (dy < -3) keys.push('KeyS');
    for (const k of keys) await page.keyboard.down(k);
    await lt('step', 50);
    for (const k of keys) await page.keyboard.up(k);
  }
  await lt('step', 300);
  const at = await toScreen(page, d.x, d.y - 4);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await lt('step', 16);
  await page.mouse.up();
  await lt('step', 400);
  const after = await dummy(page);
  assert.ok(after.hp < after.maxHp, `dummy not hit (hp ${after.hp}/${after.maxHp})`);
  // The aim pointed at the cursor (north, at the dummy).
  const p = await player(page);
  assert.ok(Math.abs(p.aim + Math.PI / 2) < 0.5, `aim ${p.aim}`);
  // Space: a dash, using the charge.
  await lt('step', 500);
  await page.keyboard.down('KeyD');
  await page.keyboard.press('Space');
  await lt('step', 25);
  const dash = await player(page);
  await page.keyboard.up('KeyD');
  assert.equal(dash.state, 'dash');
  assert.equal(dash.dashCharges, 0);
  await lt('step', 300);
  const moved = await player(page);
  assert.ok(moved.x - p.x > 40, `dash moved only ${moved.x - p.x}`);
  assert.deepEqual(page.problems, []);
  await close(page);
});

test('Esc pauses (pause screen, the sim stops) and Esc resumes', async () => {
  const page = await open(env.browser, env.base, 'debug&play&seed=3&room=4');
  const lt = await hook(page);
  await until(async () => (await lt('state')).roomState === 'combat', 15000, 200, 'combat');
  await lt('god');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await until(async () => (await lt('state')).phase === 'paused', 5000, 100, 'paused');
  assert.equal((await lt('state')).screen, 'pause');
  await page.waitForSelector('.scr-pause button[data-id="resume"]', { state: 'visible' });
  const t0 = (await player(page)).time;
  const e0 = await page.evaluate(() => window.__lt.world().enemies.map((e) => [e.x, e.y]));
  await page.waitForTimeout(1500); // several rendered frames
  assert.equal((await player(page)).time, t0, 'world time advanced while paused');
  assert.deepEqual(await page.evaluate(() => window.__lt.world().enemies.map((e) => [e.x, e.y])), e0);
  await shot(page, 'pause');
  await page.keyboard.press('Escape');
  await until(async () => playing(await lt('state')), 30000, 100, 'resumed');
  await until(async () => (await player(page)).time > t0 + 0.2, 15000, 100, 'the world to resume');
  assert.deepEqual(page.problems, []);
  await close(page);
});

test('menus do not leak input: Enter, Space and clicks on menus never attack or dash', async () => {
  const page = await open(env.browser, env.base, 'debug&seed=3');
  const lt = await hook(page);
  await lt('freeze'); // the run starts frozen, so a leaked press would show up on the first step
  await page.waitForTimeout(400);
  // Click Begin Descent with the mouse.
  await page.click('.scr-title button[data-id="start"]');
  await until(async () => playing(await lt('state')), 30000, 100, 'play');
  await lt('step', 200);
  let p = await player(page);
  assert.equal(p.state, 'normal', 'the click on Begin Descent reached the game');
  // Pause, then Space on Resume (activates the focused button; must not dash).
  await page.keyboard.press('Escape');
  await until(async () => (await lt('state')).phase === 'paused', 5000);
  await page.keyboard.press('KeyJ'); // the attack key, while paused
  await page.mouse.click(20, 400); // a click on the menu backdrop
  await page.keyboard.press('Space');
  await until(async () => playing(await lt('state')), 30000, 100, 'resume with Space');
  await lt('step', 200);
  p = await player(page);
  assert.equal(p.state, 'normal', `a menu key reached the game (state ${p.state})`);
  assert.equal(p.dashCharges, 1, 'Space on the menu dashed');
  // Positive control: the same click on the canvas in play does attack.
  await page.mouse.click(640, 300);
  await lt('step', 30);
  assert.equal((await player(page)).state, 'attack', 'a click on the canvas should attack');
  assert.deepEqual(page.problems, []);
  await close(page);
});

test('after resizing mid-game the mouse still aims where it points', async () => {
  const page = await open(env.browser, env.base, 'debug&play&seed=3', { width: 1280, height: 720 });
  const lt = await hook(page);
  await until(async () => playing(await lt('state')), 30000);
  await lt('freeze');
  const check = async (label) => {
    const vp = page.viewportSize();
    const box = await page.evaluate(() => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return [r.width, r.height]; });
    assert.ok(Math.abs(box[0] - vp.width) <= 1 && Math.abs(box[1] - vp.height) <= 1, `${label}: canvas ${box} vs ${vp.width}x${vp.height}`);
    const p = await player(page);
    // The lantern sits 8 world units above the feet; aim is measured from there.
    const o = await toScreen(page, p.x, p.y - 8);
    for (const [dx, dy, want] of [[150, 0, 0], [0, -150, -Math.PI / 2], [-150, 0, Math.PI], [0, 150, Math.PI / 2], [110, 110, Math.PI / 4]]) {
      await page.mouse.move(o.x + dx, o.y + dy);
      await lt('step', 9);
      const a = (await player(page)).aim;
      const err = Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want)));
      assert.ok(err < 0.06, `${label}: pointing ${dx},${dy} gives aim ${a.toFixed(3)}, want ${want.toFixed(3)}`);
    }
    // And the point under the cursor maps back onto the keeper's screen position.
    const back = await page.evaluate(([x, y]) => window.__lt.scene.screenToWorld(x, y), [o.x, o.y]);
    assert.ok(Math.hypot(back.x - p.x, back.y - (p.y - 8)) < 0.5);
  };
  await check('1280x720');
  for (const [w, h] of [[900, 700], [1600, 900], [600, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    // The resize handler, then a rendered frame so the camera's worldView is current.
    await until(() => page.evaluate(([w, h]) => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return Math.abs(r.width - w) <= 1 && Math.abs(r.height - h) <= 1; }, [w, h]), 8000, 100, `canvas to follow the resize to ${w}x${h}`);
    await page.waitForTimeout(500);
    await lt('step', 9);
    await check(`${w}x${h}`);
  }
  assert.deepEqual(page.problems, []);
  await close(page);
});
