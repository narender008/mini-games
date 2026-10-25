// Real input, no hook inputs: keyboard moves and dashes the hero, the mouse
// aims and attacks, right click fires the special, Q snares, Escape pauses,
// and on a phone-sized touch screen the floating stick moves and the buttons
// attack and dash. Also a gamepad through a faked navigator.getGamepads.
const { test } = require('node:test');
const { suite, clean, assert, B, G } = require('./lib/suite.cjs');
const env = suite();
const { sleep } = G;

// A live (unfrozen) run, god mode, no foes so nothing interrupts.
async function liveRun(extra = '', opts) {
  const { page, lw } = await env.debug(extra, opts);
  await lw('play', { seed: 55 });
  await G.waitScene(lw, G.RUN_SCENES, 10000);
  await lw('god', true);
  await lw('clear');
  await sleep(500);
  return { page, lw };
}

// Where a world point is on screen: the hero at the start is near the middle,
// so offsets are taken from the canvas centre.
async function centre(page) { const b = await B.canvasBox(page); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }

async function watch(lw, pred, ms = 800) {
  const t0 = Date.now();
  let s = await lw('state');
  while (Date.now() - t0 < ms) { if (pred(s)) return { ok: true, s }; await sleep(30); s = await lw('state'); }
  return { ok: pred(s), s };
}

test('WASD and the arrow keys move the hero; Space dashes', async () => {
  const { page, lw } = await liveRun();
  for (const [k, ax, sign] of [[G.KEYS.right, 'x', 1], [G.KEYS.left, 'x', -1], [G.KEYS.down, 'y', 1], [G.KEYS.up, 'y', -1], ['ArrowRight', 'x', 1]]) {
    const s0 = await lw('state');
    await page.keyboard.down(k);
    await sleep(350);
    await page.keyboard.up(k);
    const s1 = await lw('state');
    const d = (s1.hero[ax] - s0.hero[ax]) * sign;
    assert.ok(d > 30, `${k} moved the hero ${d.toFixed(1)} along ${ax}`);
  }
  await sleep(300);
  // a dash covers more ground in the same time than walking
  const w0 = await lw('state');
  await page.keyboard.down(G.KEYS.right);
  await sleep(150);
  await page.keyboard.up(G.KEYS.right);
  const walk = (await lw('state')).hero.x - w0.hero.x;
  await sleep(400);
  const d0 = await lw('state');
  await page.keyboard.down(G.KEYS.left);
  await page.keyboard.press(G.KEYS.dash);
  const dash = await watch(lw, (s) => s.hero.dashing, 300);
  await sleep(150);
  await page.keyboard.up(G.KEYS.left);
  const moved = d0.hero.x - (await lw('state')).hero.x;
  assert.ok(dash.ok, 'Space did not start a dash');
  assert.ok(moved > walk * 1.5, `dash moved ${moved.toFixed(0)}, walking moved ${walk.toFixed(0)}`);
  clean(page);
  await B.close(page);
});

test('the mouse aims, left click attacks, right click specials, Q snares, Escape pauses', async () => {
  const { page, lw } = await liveRun();
  const c = await centre(page);
  await lw('spawn', 'hollow', 1, 0, 0).catch(() => {});
  for (const [dx, dy] of [[200, 0], [-200, 0], [0, 150]]) {
    await page.mouse.move(c.x + dx, c.y + dy);
    await sleep(120);
    const s = await lw('state');
    const want = Math.atan2(dy, dx);
    const da = Math.abs(Math.atan2(Math.sin(s.hero.facing - want), Math.cos(s.hero.facing - want)));
    assert.ok(da < 0.6, `hero faces ${s.hero.facing.toFixed(2)} with the cursor at ${want.toFixed(2)}`);
  }
  const acting = (re) => (s) => re.test(String(s.hero.state));
  await page.mouse.click(c.x + 200, c.y);
  assert.ok((await watch(lw, acting(/attack|swing|combo|strike/i))).ok, 'left click did not attack');
  await sleep(500);
  await page.mouse.click(c.x + 200, c.y, { button: 'right' });
  assert.ok((await watch(lw, acting(/special|heavy|charge/i))).ok, 'right click did not use the special');
  await sleep(600);
  await page.keyboard.press(G.KEYS.snare);
  assert.ok((await watch(lw, acting(/snare|cast|throw/i))).ok, 'Q did not throw the snare');
  await page.keyboard.press(G.KEYS.pause);
  await G.waitScene(lw, 'paused', 2000);
  await page.keyboard.press(G.KEYS.pause);
  await G.waitScene(lw, G.RUN_SCENES, 2000);
  clean(page);
  await B.close(page);
});

test('touch: the floating stick moves the hero and the buttons attack and dash on a phone', async () => {
  const { page, lw } = await liveRun('touch', { width: 844, height: 390, touch: true, mobile: true });
  const stick = await G.firstVisible(page, [G.SEL.stick]);
  const atk = await G.firstVisible(page, [G.SEL.touch('attack')]);
  const dsh = await G.firstVisible(page, [G.SEL.touch('dash')]);
  assert.ok(atk && dsh, 'touch attack/dash buttons are not shown');
  // a real touch drag on the left half: CDP touch events
  const cdp = await page.context().newCDPSession(page);
  const s0 = await lw('state');
  const x0 = 160, y0 = 260;
  const tp = (x, y) => [{ x, y, id: 1, radiusX: 5, radiusY: 5, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + i * 10, y0) }); await sleep(16); }
  await sleep(500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const s1 = await lw('state');
  assert.ok(s1.hero.x - s0.hero.x > 30, `touch stick moved the hero ${(s1.hero.x - s0.hero.x).toFixed(1)} (stick element: ${!!stick})`);
  await atk.tap();
  assert.ok((await watch(lw, (s) => /attack|swing|combo|strike/i.test(String(s.hero.state)))).ok, 'touch attack button did nothing');
  await sleep(400);
  await dsh.tap();
  assert.ok((await watch(lw, (s) => s.hero.dashing)).ok, 'touch dash button did nothing');
  clean(page);
  await B.close(page);
});

test('a standard gamepad moves and attacks', async () => {
  const page = await env.open('debug&save=1');
  await page.evaluate(() => {
    const pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [pad, null, null, null];
    dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
  });
  const lw = await G.hook(page);
  await lw('play', { seed: 56 });
  await G.waitScene(lw, G.RUN_SCENES, 10000);
  await lw('god', true);
  await lw('clear');
  await sleep(400);
  const s0 = await lw('state');
  await page.evaluate(() => { window.__pad.axes[0] = 1; window.__pad.timestamp++; });
  await sleep(400);
  await page.evaluate(() => { window.__pad.axes[0] = 0; window.__pad.timestamp++; });
  const s1 = await lw('state');
  assert.ok(s1.hero.x - s0.hero.x > 30, `left stick moved the hero ${(s1.hero.x - s0.hero.x).toFixed(1)}`);
  await page.evaluate(() => { window.__pad.buttons[2] = { pressed: true, touched: true, value: 1 }; window.__pad.timestamp++; });
  const r = await watch(lw, (s) => /attack|swing|combo|strike/i.test(String(s.hero.state)));
  await page.evaluate(() => { window.__pad.buttons[2] = { pressed: false, touched: false, value: 0 }; window.__pad.timestamp++; });
  assert.ok(r.ok, 'gamepad X did not attack');
  clean(page);
  await B.close(page);
});
