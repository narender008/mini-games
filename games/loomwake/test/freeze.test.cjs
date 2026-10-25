// "The player stops": regressions for input that got stuck or ignored and hero
// states that never ended, found by stress.cjs. Real mouse and keyboard
// events through page.mouse / page.keyboard; the hook only reads state.
const { test } = require('node:test');
const { suite, clean, assert, B, G } = require('./lib/suite.cjs');
const env = suite();
const { sleep } = G;

// A live run in god mode with the first chamber cleared and its reward taken.
async function liveRun(opts = {}) {
  const { page, lw } = await env.debug();
  await lw('play', { seed: 55, ...opts });
  await G.waitScene(lw, G.RUN_SCENES, 10000);
  await lw('god', true);
  await lw('clear');
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const s = await lw('state');
    if (s.offer && s.offer.length) await lw('choose', 0);
    else if (s.scene === 'dialogue') await lw('skip');
    else if (s.scene === 'run' && s.cleared && (s.doors || []).some((d) => d.open)) break;
    await sleep(100);
  }
  await sleep(300);
  await G.waitScene(lw, G.RUN_SCENES, 3000);
  const b = await B.canvasBox(page);
  return { page, lw, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}
// Holds D and returns how far the hero walked; a conversation or card that came up on the way is
// dismissed and the walk retried, so only a hero who really cannot move reads as 0.
async function walk(page, lw) {
  let dx = 0;
  for (let i = 0; i < 3 && dx < 60; i++) {
    let s = await lw('state');
    if (s.scene === 'dialogue') await lw('skip');
    if (s.offer && s.offer.length) await lw('choose', 0);
    await G.waitScene(lw, G.RUN_SCENES, 3000);
    await page.keyboard.down('KeyD'); await sleep(150);
    const a = await lw('state'); await sleep(400); const b = await lw('state');
    await page.keyboard.up('KeyD');
    dx = a.scene === 'run' && b.scene === 'run' ? b.hero.x - a.hero.x : 0;
    await page.keyboard.down('KeyA'); await sleep(550); await page.keyboard.up('KeyA');
  }
  return dx;
}
const input = (page) => page.evaluate(() => { const g = window.__lw.game; return { attack: g.input.attack, special: g.input.special, move: { ...g.input.move }, b: g.engine.input.mouse.b.slice(), state: g.hero.state }; });

// Pointer events send pointerdown for the first button only and pointerup for the last one only; the
// buttons in between come as pointermove. Releasing left while right was still down left the attack held
// forever (the bow drew and never loosed, the blade read a held button).
test('a mouse chord neither sticks the attack button nor loses the special', async () => {
  const { page, lw, cx, cy } = await liveRun();
  await page.mouse.move(cx + 120, cy);
  await page.mouse.down({ button: 'left' }); await sleep(80);
  const cd0 = await page.evaluate(() => window.__lw.game.hero.cd.special);
  await page.mouse.down({ button: 'right' }); await sleep(150);
  const mid = await input(page);
  assert.ok(mid.special, 'the right button pressed while the left was down reads as held');
  const cd1 = await page.evaluate(() => window.__lw.game.hero.cd.special);
  assert.ok(cd1 > cd0, `the special fired from the chorded right button (cooldown ${cd0} -> ${cd1})`);
  await page.mouse.up({ button: 'left' }); await sleep(80);
  assert.equal((await input(page)).attack, false, 'left released mid-chord: attack is no longer held');
  await page.mouse.up({ button: 'right' }); await sleep(80);
  const end = await input(page);
  assert.deepEqual(end.b, [false, false, false], 'no button left down');
  assert.equal(end.attack || end.special, false);
  clean(page);
  await B.close(page);
});

test('the bow looses after a chord instead of drawing forever', async () => {
  const { page, lw, cx, cy } = await liveRun({ weapon: 'bow' });
  await page.mouse.move(cx + 150, cy);
  await page.mouse.down({ button: 'left' }); await sleep(150);
  await page.mouse.down({ button: 'right' }); await sleep(60);
  await page.mouse.up({ button: 'left' }); await sleep(60);
  await page.mouse.up({ button: 'right' });
  await sleep(1200);
  const s = await lw('state');
  assert.equal(s.hero.state, 'move', `the hero is free again (state ${s.hero.state})`);
  const dx = await walk(page, lw);
  assert.ok(dx > 60, `walks after the chord (${dx.toFixed(0)} px)`);
  clean(page);
  await B.close(page);
});

// A hidden tab (and Cmd held on macOS) swallows keyups: the key held at that moment must not walk on.
test('keys held when the tab is hidden or Cmd goes down are let go', async () => {
  const { page, cx } = await liveRun();
  const vis = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await page.keyboard.down('KeyD'); await sleep(150);
  assert.ok((await input(page)).move.x > 0.5, 'D walks right');
  await vis(true); await sleep(60); await vis(false); await sleep(150);
  assert.equal((await input(page)).move.x, 0, 'after the tab was hidden the lost key no longer walks');
  await page.keyboard.up('KeyD');
  // Cmd: the browser sends no keyup for keys released under it
  await page.keyboard.down('KeyA'); await page.keyboard.down('Meta'); await sleep(100);
  await page.evaluate(() => { const o = { bubbles: true, cancelable: true }; dispatchEvent(new KeyboardEvent('keyup', { ...o, key: 'Meta', code: 'MetaLeft' })); });
  await sleep(100);
  assert.equal((await input(page)).move.x, 0, 'Cmd let go of A, whose keyup never came');
  await page.keyboard.up('Meta'); await page.keyboard.up('KeyA');
  // and a held mouse button whose pointerup was lost is let go by the next move
  await page.mouse.move(cx, 300);
  await page.evaluate(() => { window.__lw.game.engine.input.mouse.b[0] = true; });
  await page.mouse.move(cx + 40, 320);
  await sleep(60);
  assert.equal((await input(page)).attack, false, 'a pointermove with no button down clears a stale press');
  clean(page);
  await B.close(page);
});

test('right click over the HUD in play opens no browser menu', async () => {
  const { page } = await liveRun();
  const prevented = await page.evaluate(() => {
    const el = document.querySelector('#btn-pause') || document.body;
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  assert.ok(prevented, 'contextmenu prevented');
  clean(page);
  await B.close(page);
});

// The snare pull: the bound foe dying mid-pull (another hit, a burn) dropped the thread but left the hero
// in 'snareRecall' for good, frozen in the throw pose.
test('a snare pull whose foe dies hands the hero back', async () => {
  const { page, lw } = await liveRun();
  await lw('freeze');
  const [id] = await lw('spawn', 'hollow', 1);
  await lw('step', 1500, { render: false });
  const s = await page.evaluate((fid) => {
    const g = window.__lw.game, h = g.hero, e = g.foes.find((f) => f.id === fid);
    e.x = h.x + 300; e.y = h.y; e.spawning = false; e.untargetable = false;
    h.state = 'snareRecall'; h.st = 0;
    h.snare = { state: 'pull', x: e.x, y: e.y, dx: 1, dy: 0, d: 300, t: 0, target: e.id, heavy: false };
    e.dead = true; e.hp = 0;
    g.dialogue = null; g.offer = null; g.scene = 'run'; g.paused = false; g.hitstop = 0;
    window.__lw.step(50, { render: false });
    return { state: h.state, snare: h.snare };
  }, id);
  assert.equal(s.snare, null, 'thread dropped');
  assert.equal(s.state, 'move', 'hero back to move');
  clean(page);
  await B.close(page);
});
