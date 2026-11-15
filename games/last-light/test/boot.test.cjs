// Boot, viewports, settings persistence, hostile localStorage and audio, against the built game.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, open, close, hook, until, shown, shot, frameStats, playing } = require('./lib/browser.cjs');

const KEY_S = 'emberfall-last-light.settings.v1';
const KEY_R = 'emberfall-last-light.records.v1';
let env;
test.before(async () => { env = await setup(); });
test.after(async () => { await env.done(); });

test('boots to the title with no console errors, page errors, failed or external requests', async () => {
  const page = await open(env.browser, env.base, 'debug&seed=5');
  const lt = await hook(page);
  const s = await lt('state');
  assert.equal(s.phase, 'title');
  assert.equal(s.screen, 'title');
  await page.waitForSelector('.scr-title button[data-id="start"]', { state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), 'start', 'Begin Descent has focus');
  await page.waitForTimeout(1500); // let the attract scene render a few frames
  const st = await frameStats(page);
  assert.ok(st.std > 8 && st.colours > 40, `title frame looks blank: ${JSON.stringify(st)}`);
  await shot(page, 'title');
  assert.deepEqual(page.problems, []);
  await close(page);
});

for (const [w, h] of [[1600, 900], [1280, 720], [1024, 640], [390, 844]]) {
  test(`viewport ${w}x${h}: boots into play, canvas fills the window, HUD visible, no errors`, async () => {
    const page = await open(env.browser, env.base, 'debug&play&seed=8', { width: w, height: h });
    const lt = await hook(page);
    await until(async () => playing(await lt('state')), 60000, 100, 'play');
    await shown(page);
    await page.waitForTimeout(1200);
    const box = await page.evaluate(() => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y }; });
    assert.ok(Math.abs(box.w - w) <= 1 && Math.abs(box.h - h) <= 1 && box.x === 0 && box.y === 0, `canvas ${JSON.stringify(box)}`);
    const hud = await page.evaluate(() => {
      const el = document.getElementById('hud');
      const parts = ['.hud-tl', '.hp-frame', '.objective', '.xp'].map((sel) => {
        const e = el.querySelector(sel);
        if (!e) return { sel, missing: true };
        const r = e.getBoundingClientRect();
        return { sel, x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height };
      });
      return { off: el.classList.contains('off'), opacity: getComputedStyle(el).opacity, parts };
    });
    assert.equal(hud.off, false);
    for (const p of hud.parts) {
      assert.ok(!p.missing, `${p.sel} missing`);
      assert.ok(p.w > 0 && p.h > 0, `${p.sel} has no size`);
      assert.ok(p.x >= -1 && p.y >= -1 && p.r <= w + 1 && p.b <= h + 1, `${p.sel} outside the ${w}x${h} viewport: ${JSON.stringify(p)}`);
    }
    // The keeper is on screen.
    const ps = await page.evaluate(() => { const s = window.__lt.scene, p = s.world.player; return s.worldToScreen(p.x, p.y); });
    assert.ok(ps.x > 0 && ps.x < w && ps.y > 0 && ps.y < h, `keeper off screen at ${JSON.stringify(ps)}`);
    const st = await frameStats(page);
    assert.ok(st.std > 8 && st.colours > 40, `frame looks blank: ${JSON.stringify(st)}`);
    if (w === 1280) await shot(page, 'sanctum');
    if (w === 390) await shot(page, 'portrait-390x844');
    assert.deepEqual(page.problems, []);
    await close(page);
  });
}

test('malformed and hostile localStorage does not break boot; defaults are used', async () => {
  const cases = [
    ['{', '[]'],
    ['{"master":"loud","muted":"yes","textScale":1e308,"shake":{"a":1},"__proto__":{"muted":true}}', '{"runs":"9","bestTime":-1,"lastWeapon":"<img src=x onerror=alert(1)>"}'],
    ['null', '"x"'],
  ];
  for (const [badS, badR] of cases) {
    const bad = `${badS} / ${badR}`;
    const page = await open(env.browser, env.base, 'debug', { storage: { [KEY_S]: badS, [KEY_R]: badR } });
    const lt = await hook(page);
    assert.equal((await lt('state')).screen, 'title', bad);
    const st = await page.evaluate(() => ({ s: window.__lt.app.settings, r: window.__lt.app.records }));
    assert.equal(st.s.muted, false, bad);
    assert.equal(st.s.master, 0.8, bad);
    assert.ok(st.s.textScale >= 1 && st.s.textScale <= 1.3, bad);
    assert.equal(st.r.runs, 0, bad);
    // ...and the game still starts (the title ignores keys for 250 ms after it opens).
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await until(async () => playing(await lt('state')), 60000, 100, 'play');
    assert.deepEqual(page.problems, [], bad);
    await close(page);
  }
});

// Records every AudioContext and the gain node feeding its compressor (the master gain), so the test can
// check what the audio module did without the module exposing anything.
const audioSpy = () => {
  window.__acs = [];
  window.__master = [];
  const AC = window.AudioContext;
  window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__acs.push(this); } };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...rest) {
    if (this instanceof GainNode && typeof DynamicsCompressorNode !== 'undefined' && dst instanceof DynamicsCompressorNode) window.__master.push(this);
    return connect.call(this, dst, ...rest);
  };
};
const audioState = (page) => page.evaluate(() => ({ n: window.__acs.length, state: window.__acs[0]?.state ?? null, master: window.__master[0]?.gain.value ?? null }));

test('settings: mute through the settings menu reaches the AudioContext and persists across reload', async () => {
  const ctx = await env.browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(audioSpy);
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`console: ${m.text()}`); });
  await page.goto(`${env.base}/games/last-light/?debug`);
  const lt = await hook(page, 30000);
  // No audio before the first input (autoplay rules).
  assert.equal((await audioState(page)).n, 0, 'an AudioContext was made before any input');
  await page.waitForTimeout(300); // title guard
  // Title: Down to Settings, Enter.
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), 'settings');
  await page.keyboard.press('Enter');
  await until(async () => (await lt('state')).screen === 'settings', 5000, 100, 'settings screen');
  let a = await until(async () => { const s = await audioState(page); return s.n === 1 && s.state === 'running' && s; }, 5000, 100, 'running AudioContext after first input');
  assert.ok(a.master > 0.3, `master gain before mute: ${a.master}`);
  // Settings: focus starts on master volume; the 4th row is "Mute all". Enter toggles it.
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), 'master');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), 'muted');
  await page.keyboard.press('Enter');
  a = await until(async () => { const s = await audioState(page); return s.master !== null && s.master < 0.01 && s; }, 5000, 100, 'master gain to fall to 0');
  assert.equal(a.state, 'running');
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY_S);
  assert.equal(stored.muted, true);
  // Also change the volume: Up to Effects, Left twice = -10%.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const sfx = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).sfx, KEY_S);
  assert.ok(Math.abs(sfx - 0.75) < 1e-9, `sfx ${sfx}`);
  // Esc back to the title.
  await page.keyboard.press('Escape');
  await until(async () => (await lt('state')).screen === 'title', 5000, 100, 'title');

  await page.reload();
  const lt2 = await hook(page, 30000);
  const s2 = await page.evaluate(() => window.__lt.app.settings);
  assert.equal(s2.muted, true);
  assert.ok(Math.abs(s2.sfx - 0.75) < 1e-9);
  // The muted setting is applied when the context is made after reload.
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await until(async () => (await lt2('state')).screen === 'settings', 5000, 100, 'settings');
  a = await until(async () => { const s = await audioState(page); return s.n === 1 && s.master !== null && s; }, 5000, 100, 'AudioContext after reload');
  assert.ok(a.master < 0.01, `muted after reload but master gain is ${a.master}`);
  assert.equal(await page.locator('.srow[data-id="muted"] .chip.on').innerText(), 'On');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
