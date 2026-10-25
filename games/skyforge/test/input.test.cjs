// Input: the mouse places, selects and cancels; drag pans and the wheel
// zooms; keyboard pans and its shortcut keys open panels and set the speed;
// on a phone screen a tap places, a one-finger drag pans and a pinch zooms.
const { test } = require('node:test');
const { suite, clean, assert, B, G } = require('./lib/suite.cjs');
const env = suite();
const { sleep, SEL, KEYS } = G;

// Tutorial hints are switched off (as the Settings toggle does) so a hint
// card floating over the world does not take the test's clicks; the last test
// checks the hints never cover the HUD's own buttons.
async function colony(extra = '', opts, { hints = false } = {}) {
  const { page, sf } = await env.debug(extra, opts);
  if (!hints) await page.evaluate(() => { const a = window.__sf.app; a.settings = { ...(a.settings || {}), tutorial: false }; });
  const s = await G.freshColony(page, sf);
  await sf('thaw');
  await sleep(300);
  return { page, sf, s };
}

const cam = (sf) => sf('camera');
const moved = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

test('mouse: pick from the palette, click to place, right click cancels a placement', async () => {
  const { page, sf, s } = await colony();
  const home = G.homeIsland(s);
  await G.clickOr(page, [SEL.build], KEYS.build);
  const item = await G.waitVisible(page, [SEL.buildItem()], 3000);
  assert.ok(item, 'no build palette items');
  const type = await item.getAttribute('data-build');
  // cancel first
  await sleep(400);
  await item.click();
  const p = await G.spot(sf, type, home);
  const xy = await sf('toScreen', home, p.x, p.y);
  await page.mouse.move(xy.x, xy.y);
  await page.mouse.click(xy.x, xy.y, { button: 'right' });
  await sleep(200);
  const n0 = (await sf('state')).buildings.length;
  await page.mouse.click(xy.x, xy.y);
  await sleep(300);
  assert.equal((await sf('state')).buildings.length, n0, 'a right-click-cancelled placement still placed a building');
  // then place for real (the palette may still be open)
  if (!(await G.firstVisible(page, [SEL.buildItem(type)]))) await G.clickOr(page, [SEL.build], KEYS.build);
  await sleep(400); // let the palette finish sliding in
  await (await G.waitVisible(page, [SEL.buildItem(type)], 3000)).click();
  await page.mouse.click(xy.x, xy.y);
  await sleep(300);
  const st = await sf('state');
  assert.equal(st.buildings.length, n0 + 1, `clicking the island did not place a ${type}`);
  clean(page);
  await B.close(page);
});

test('mouse: clicking a building selects it', async () => {
  const { page, sf, s } = await colony();
  // a building whose spot on screen is the canvas, not a HUD card over it
  let b = null, xy = null;
  for (const x of s.buildings) {
    const p = await sf('toScreen', x.island, x.x, x.y);
    if (p && await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id === 'scene', [p.x, p.y])) { b = x; xy = p; break; }
  }
  assert.ok(b, `every starting building is under a HUD element: ${s.buildings.map((x) => x.type).join(', ')}`);
  await page.mouse.click(xy.x, xy.y);
  await sleep(300);
  const sel = (await sf('app.mode')).select;
  assert.equal(sel, b.id, `clicking ${b.type} (${b.id}) at ${xy.x.toFixed(0)},${xy.y.toFixed(0)} did not select it (selected ${sel})`);
  assert.ok(await G.waitVisible(page, [SEL.inspector], 2000), 'selecting a building did not open the inspector');
  await page.keyboard.press('Escape');
  await sleep(300);
  const after = await sf('state');
  assert.ok((await sf('app.mode')).select == null || after.scene === 'paused', 'Escape did not clear the selection');
  clean(page);
  await B.close(page);
});

test('mouse: drag pans and the wheel zooms', async () => {
  const { page, sf } = await colony();
  const box = await B.canvasBox(page);
  const c0 = await cam(sf);
  const cx = box.x + box.w * 0.5, cy = box.y + box.h * 0.55;
  // pan with the right or middle button or plain drag on empty sky, whichever the game uses
  for (const button of ['left', 'middle', 'right']) {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button });
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx - i * 25, cy - i * 12);
    await page.mouse.up({ button });
    await sleep(150);
    if (moved(c0, await cam(sf)) > 1e-3) break;
  }
  const c1 = await cam(sf);
  assert.ok(moved(c0, c1) > 1e-3, `drag did not pan the camera: ${JSON.stringify(c0)} -> ${JSON.stringify(c1)}`);
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -600);
  await sleep(800); // the zoom eases in
  const c2 = await cam(sf);
  assert.ok(c2.zoom > c1.zoom, `wheel up did not zoom in (${c1.zoom} -> ${c2.zoom})`);
  await page.mouse.wheel(0, 1200);
  await sleep(800);
  assert.ok((await cam(sf)).zoom < c2.zoom, 'wheel down did not zoom out');
  clean(page);
  await B.close(page);
});

test('keyboard: WASD pans, B/R/M/F open panels, number keys set the speed, Esc pauses', async () => {
  const { page, sf } = await colony();
  const c0 = await cam(sf);
  await page.keyboard.down(KEYS.panRight);
  await sleep(500);
  await page.keyboard.up(KEYS.panRight);
  const c1 = await cam(sf);
  assert.ok(c1.x !== c0.x, 'D did not pan the camera');
  await page.keyboard.press(KEYS.zoomIn);
  await sleep(200);
  assert.ok((await cam(sf)).zoom > c1.zoom, '+ did not zoom in');
  for (const [key, scene] of [[KEYS.research, 'research'], [KEYS.chart, 'chart'], [KEYS.fleet, 'fleet']]) {
    await page.keyboard.press(key);
    await G.waitScene(sf, scene, 3000);
    await page.keyboard.press('Escape');
    await G.waitScene(sf, 'colony', 3000);
  }
  await page.keyboard.press(KEYS.build);
  assert.ok(await G.waitVisible(page, [SEL.buildItem()], 3000), 'B did not open the build palette');
  await page.keyboard.press('Escape');
  await sleep(200);
  for (const n of [2, 3, 1]) {
    await page.keyboard.press(KEYS.speed(n));
    await sleep(100);
    assert.equal((await sf('state')).speed, n, `key ${n} did not set speed ${n}`);
  }
  await page.keyboard.press(KEYS.pause);
  await sleep(100);
  assert.equal((await sf('state')).speed, 0, 'Space did not pause the clock');
  await page.keyboard.press(KEYS.pause);
  await sleep(100);
  assert.ok((await sf('state')).speed > 0, 'Space did not resume the clock');
  await page.keyboard.press('Escape');
  await G.waitScene(sf, 'paused', 3000);
  await page.keyboard.press('Escape');
  await G.waitScene(sf, 'colony', 3000);
  clean(page);
  await B.close(page);
});

test('keyboard: raid abilities on Q W E T during a raid', async () => {
  const { page, sf } = await colony();
  await sf('freeze');
  await sf('play', { seed: 1234, preset: 'raid' });
  await G.stepUntil(page, 's => s.scene === "colony"', { ms: 10000, chunk: 100 });
  await sf('raid');
  const r = await G.stepUntil(page, 's => s.threat.raid && s.threat.raid.active', { ms: 120000, chunk: 500 });
  assert.ok(r.ok, 'raid() did not start a raid');
  await sf('thaw');
  const used = [];
  for (const a of G.DEFEND) {
    const before = JSON.stringify(await sf('game.defend'));
    await page.keyboard.press(KEYS[a]);
    await sleep(250);
    const after = JSON.stringify(await sf('game.defend'));
    if (after !== before) used.push(a);
  }
  assert.ok(used.length >= 3, `only ${used.join(', ') || 'none'} of ${G.DEFEND.join(', ')} reacted to their keys`);
  clean(page);
  await B.close(page);
});

test('touch on a phone: tap the palette and the island to place, drag pans, pinch zooms', async () => {
  const { page, sf, s } = await colony('touch', { width: 844, height: 390, touch: true, mobile: true });
  const home = G.homeIsland(s);
  await (await G.waitVisible(page, [SEL.build], 3000))?.tap();
  const item = await G.waitVisible(page, [SEL.buildItem()], 3000);
  assert.ok(item, 'no build palette on a phone');
  const type = await item.getAttribute('data-build');
  await item.tap();
  const p = await G.spot(sf, type, home);
  const xy = await sf('toScreen', home, p.x, p.y);
  const n0 = (await sf('state')).buildings.length;
  const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.id !== 'scene' ? `${e.tagName}#${e.id}.${e.className}` : null; }, [xy.x, xy.y]);
  assert.equal(hit, null, `on a phone the HUD covers the spot to build on (${hit} is over it)`);
  await page.touchscreen.tap(xy.x, xy.y);
  await sleep(300);
  let n = (await sf('state')).buildings.length;
  // a tap drops the ghost; the check button (or a second tap) confirms
  if (n === n0) { if (!(await G.clickOr(page, [SEL.placeOk], null, 800))) await page.touchscreen.tap(xy.x, xy.y); await sleep(300); n = (await sf('state')).buildings.length; }
  assert.equal(n, n0 + 1, `tapping the island did not place a ${type}`);
  // one finger drag and a pinch, through CDP touch events
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const box = await B.canvasBox(page);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const c0 = await cam(sf);
  await touch('touchStart', [[cx, cy]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[cx - i * 15, cy - i * 6]]);
  await touch('touchEnd', []);
  await sleep(200);
  const c1 = await cam(sf);
  assert.ok(moved(c0, c1) > 1e-3, 'one-finger drag did not pan');
  await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[cx - 40 - i * 12, cy], [cx + 40 + i * 12, cy]]);
  await touch('touchEnd', []);
  await sleep(200);
  assert.ok((await cam(sf)).zoom > c1.zoom, 'pinch out did not zoom in');
  clean(page);
  await B.close(page);
});

test('the HUD fits a phone in portrait and landscape with nothing off screen', async () => {
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const { page } = await colony('touch', { width: w, height: h, touch: true, mobile: true });
    const off = await page.evaluate(([W, H]) => [...document.querySelectorAll('button, [data-build], [data-speed]')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return false;
      // inside a scrolling strip (the build palette) is fine: it scrolls into view
      for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a); if (/(auto|scroll)/.test(o.overflowX + o.overflowY) && (a.scrollWidth > a.clientWidth || a.scrollHeight > a.clientHeight)) return false; }
      // wholly off screen is a panel slid away; cut by an edge is the fault
      const onScreen = r.right > 0 && r.bottom > 0 && r.left < W && r.top < H;
      return onScreen && (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1);
    }).map((el) => el.id || el.outerHTML.slice(0, 90)), [w, h]);
    assert.deepEqual(off, [], `${w}x${h}: controls off screen`);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.ok(!scroll, `${w}x${h}: page scrolls sideways`);
    clean(page);
    await B.close(page);
  }
});

test('tutorial hints never cover the HUD buttons, on a desktop or a phone', async () => {
  for (const [w, h, touch] of [[1280, 720, false], [844, 390, true], [390, 844, true]]) {
    const { page, sf } = await colony(touch ? 'touch' : '', { width: w, height: h, touch, mobile: touch }, { hints: true });
    const hits = [];
    // the first chapter's hints, one after another: look after each step is done for it
    for (let k = 0; k < 6; k++) {
      await sleep(900);
      const over = await page.evaluate(() => {
        const card = document.querySelector('.bubble.tut');
        if (!card || card.hidden || !card.getBoundingClientRect().width) return null;
        const c = card.getBoundingClientRect();
        return [...document.querySelectorAll('#ui button[id], #ui [data-speed]')].filter((el) => !card.contains(el) && el.getBoundingClientRect().width).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top;
        }).map((el) => el.id || el.dataset.speed);
      });
      if (over && over.length) hits.push(`step ${k}: ${over.join(', ')}`);
      // finish the current goal step the cheap way: let a minute of the colony pass
      await sf('step', 60000, { render: true });
    }
    assert.deepEqual(hits, [], `${w}x${h}: the tutorial card covers HUD buttons`);
    clean(page);
    await B.close(page);
  }
});
