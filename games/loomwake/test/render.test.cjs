// Painting tests: every scene the painters meet draws without an exception,
// without a blank frame and without NaN coordinates reaching the canvas.
// main.js swallows draw errors after the first five, so a throwing painter
// would otherwise only show as a half-drawn or black screen; here a page-side
// wrapper around renderer.draw records each one with its stack, the canvas
// save/restore depth (a save left open keeps its clip and alpha for every
// later frame), non-finite arguments to the main drawing calls (a burst at
// NaN draws nothing), and a 24x14 luminance sample of every frame.
const { test } = require('node:test');
const { suite, clean, assert, B, G } = require('./lib/suite.cjs');
const env = suite();
const { sleep } = G;

// Page-side recorder, installed before the game's modules run.
function recorder() {
  const R = window.__paint = { errors: {}, nonfinite: {}, blanks: [], frames: 0, leaks: [], sample: true, tag: '' };
  const P = CanvasRenderingContext2D.prototype;
  const depth = new WeakMap();
  const save = P.save, restore = P.restore;
  P.save = function () { depth.set(this, (depth.get(this) || 0) + 1); return save.call(this); };
  P.restore = function () { const d = depth.get(this) || 0; if (d > 0) depth.set(this, d - 1); return restore.call(this); };
  const where = () => String(new Error().stack).split('\n').slice(3, 5).map((l) => l.trim().replace(/https?:\/\/[^/]+/, '').replace(/^at /, '')).join(' < ');
  for (const [name, n] of [['arc', 5], ['ellipse', 7], ['drawImage', 9], ['moveTo', 2], ['lineTo', 2], ['translate', 2], ['createRadialGradient', 6], ['fillRect', 4]]) {
    const f = P[name];
    P[name] = function (...a) {
      for (let i = 0; i < n && i < a.length; i++) if (typeof a[i] === 'number' && !Number.isFinite(a[i])) { const k = `${name} @ ${where()} [${R.tag}]`; R.nonfinite[k] = (R.nonfinite[k] || 0) + 1; break; }
      return f.apply(this, a);
    };
  }
  const install = () => {
    const lw = window.__lw;
    if (!lw || !lw.renderer) return false;
    const rd = lw.renderer, draw = rd.draw, canvas = document.getElementById('scene'), ctx = canvas.getContext('2d');
    const small = document.createElement('canvas'); small.width = 24; small.height = 14;
    const sg = small.getContext('2d', { willReadFrequently: true });
    rd.draw = function (g, dt) {
      R.frames++;
      const d0 = depth.get(ctx) || 0;
      try { draw.call(this, g, dt); } catch (err) {
        const k = `${err && err.message} | ${String(err && err.stack).split('\n').slice(1, 4).map((s) => s.trim().replace(/https?:\/\/[^/]+/, '')).join(' < ')} [${g.scene} ${R.tag}]`;
        R.errors[k] = (R.errors[k] || 0) + 1;
      }
      const d1 = depth.get(ctx) || 0;
      if (d1 !== d0 && R.leaks.length < 10) R.leaks.push({ d0, d1, scene: g.scene, tag: R.tag });
      if (!R.sample || g.scene === 'title' || g.scene === 'profiles' || g.scene === 'loading') return;
      sg.drawImage(canvas, 0, 0, 24, 14);
      const px = sg.getImageData(0, 0, 24, 14).data;
      let s = 0, q = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) { const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; s += l; q += l * l; n++; }
      const m = s / n, sd = Math.sqrt(Math.max(0, q / n - m * m));
      if (sd < 2.5 && R.blanks.length < 20) R.blanks.push({ mean: +m.toFixed(1), sd: +sd.toFixed(2), scene: g.scene, chamber: g.chamber && g.chamber.id, tag: R.tag });
    };
    R.installed = true;
    return true;
  };
  const iv = setInterval(() => { if (install()) clearInterval(iv); }, 10);
}

async function openPainted(query) {
  const ctx = await env.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(recorder);
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`console: ${m.text()}`); });
  await page.goto(`${env.server.url}${B.GAME}?${query}`, { waitUntil: 'load' });
  const lw = await G.hook(page);
  await page.waitForFunction(() => window.__paint.installed);
  return { page, lw };
}

// Steps the frozen sim in frames of `frame` ms, drawing each one; dialogue is skipped.
const run = (page, ms, frame = 1000 / 30, tag = '') => page.evaluate(([ms, frame, tag]) => {
  const lw = window.__lw;
  window.__paint.tag = tag;
  for (let t = 0; t < ms; t += frame) { if (lw.game.scene === 'dialogue') lw.skip(); lw.step(frame, { render: true }); }
  return lw.state();
}, [ms, frame, tag]);

async function painted(page) {
  const r = await page.evaluate(() => { const p = window.__paint; return { errors: p.errors, nonfinite: p.nonfinite, blanks: p.blanks, leaks: p.leaks, frames: p.frames }; });
  assert.ok(r.frames > 0, 'no frame was drawn');
  assert.deepEqual(Object.keys(r.errors), [], `painters threw:\n${JSON.stringify(r.errors, null, 1)}`);
  assert.deepEqual(r.leaks, [], 'a frame left canvas save()s open (its clip and alpha stay for every later frame)');
  assert.deepEqual(Object.keys(r.nonfinite), [], `non-finite coordinates reached the canvas:\n${JSON.stringify(r.nonfinite, null, 1)}`);
  assert.deepEqual(r.blanks, [], 'blank (single-colour) frames');
  return r;
}

test('every enemy kind, plain and elite, in each of its regions draws from spawn to death', async () => {
  const { page, lw } = await openPainted('debug&freeze');
  const C = await lw('content');
  for (const region of G.REGIONS) {
    await lw('region', region);
    await run(page, 300);
    await lw('god', true);
    const kinds = C.enemies.filter((e) => (e.regions || []).includes(region)).map((e) => e.id);
    for (let i = 0; i < kinds.length; i += 3) {
      const group = kinds.slice(i, i + 3);
      await page.evaluate((group) => {
        const lw = window.__lw, G = lw.game, sp = lw.modules.enemies.spawn;
        group.forEach((k, j) => { lw.spawn(k, 1); sp(G, k, G.hero.x + 160 * (j - 1), G.hero.y - 140, { elite: true }); });
      }, group);
      await run(page, 1500, 1000 / 15, `${region}:${group}`);
      await lw('clear');
      await run(page, 800, 1000 / 15, `${region}:${group} death`);
    }
  }
  await painted(page);
  clean(page);
  await B.close(page);
});

test('every boss fight, its phases, its defeat and its death burst draw', async () => {
  const { page, lw } = await openPainted('debug&freeze');
  for (const id of G.BOSSES) {
    await lw('boss', id);
    await lw('god', true);
    await lw('auto', true);
    await run(page, 2500, 1000 / 20, `${id} intro`);
    for (let k = 0; k < 3; k++) {
      // into the next phase
      await page.evaluate(() => { const b = window.__lw.game.boss; if (b && b.hp > 1) b.hp = Math.max(1, b.hp - b.maxHp * 0.3); });
      await run(page, 2000, 1000 / 20, `${id} phase`);
    }
    await lw('auto', false);
    await lw('bossKill');
    await run(page, 7000, 1000 / 20, `${id} death`);
  }
  await painted(page);
  clean(page);
  await B.close(page);
});

test('the hub, every conversation portrait, a death and the way back draw', async () => {
  const { page, lw } = await openPainted('debug&freeze');
  await lw('hub');
  await run(page, 1000, 1000 / 20, 'hub');
  for (const npc of ['orrin', 'thimbleby', 'pell', 'nell', 'weaver']) {
    await lw('talk', npc);
    for (let i = 0; i < 4; i++) {
      await run(page, 300, 1000 / 20, `talk ${npc}`);
      await page.evaluate(() => { const lw = window.__lw, d = lw.game.dialogue; if (d && d.choices && d.choices.length) lw.answer(0); else lw.advance(); });
    }
    await lw('skip');
  }
  await lw('play', { seed: 21 });
  await run(page, 1500, 1000 / 20, 'run');
  await lw('kill');
  await run(page, 4000, 1000 / 20, 'death');
  await page.evaluate(() => window.__lw.hub());
  await run(page, 1500, 1000 / 20, 'back in the hub');
  await painted(page);
  clean(page);
  await B.close(page);
});

test('real-time play on autopilot draws every frame, through a resize', async () => {
  const { page, lw } = await openPainted('debug');
  await lw('region', 'forge', { seed: 77 });
  await lw('god', true);
  await lw('auto', true);
  await sleep(2500);
  await page.setViewportSize({ width: 960, height: 600 });
  await sleep(1500);
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(1500);
  await painted(page);
  clean(page);
  await B.close(page);
});

test('the title keeps animating when it comes back right after it was left', async () => {
  const page = await env.open('debug');
  const lw = await G.hook(page);
  await G.waitScene(lw, 'title', 5000);
  await sleep(500);
  // out to Settings and straight back, inside the title's fade-out
  await page.evaluate(() => { const G = window.__lw.game; G.api.openSettings(); });
  await sleep(120);
  await page.evaluate(() => { const G = window.__lw.game; G.api.closeSettings(); });
  await sleep(900);
  const a = await page.screenshot();
  await sleep(700);
  const b = await page.screenshot();
  const d = await B.frameDiff(page, a, b);
  assert.ok(d > 0.002, `the title art stopped (diff ${d})`);
  clean(page);
  await B.close(page);
});

test('the camera comes back from one non-finite hero position instead of losing the world for good', async () => {
  const { page, lw } = await openPainted('debug&freeze');
  await lw('play', { seed: 8 });
  await run(page, 600);
  const r = await page.evaluate(() => {
    const lw = window.__lw, G = lw.game, h = G.hero, cam = lw.renderer.cam, x = h.x;
    h.x = NaN; lw.renderer.draw(G, 1 / 60); G.bus.emit('shake', { a: 0.5, x: NaN, y: NaN }); h.x = x;
    window.__paint.blanks.length = 0;
    for (let i = 0; i < 30; i++) lw.step(1000 / 60, { render: true });
    return { x: cam.x, y: cam.y, zoom: cam.zoom, sx: cam.sx, sy: cam.sy, blanks: window.__paint.blanks.length };
  });
  for (const k of ['x', 'y', 'zoom', 'sx', 'sy']) assert.ok(Number.isFinite(r[k]), `camera ${k} stayed ${r[k]}`);
  assert.equal(r.blanks, 0, 'frames stayed blank after the hero position came back');
  await B.close(page);
});

test('boss poses keep the sim\'s time on a 144 Hz display and through hit-stops', async () => {
  const { page } = await openPainted('debug&freeze');
  const r = await page.evaluate(() => {
    const lw = window.__lw, G = lw.game, R = lw.renderer;
    lw.boss('veyl'); lw.god(true);
    for (let i = 0; i < 1000 && !(G.boss && G.scene === 'run' && i > 400); i++) { if (G.scene === 'dialogue') lw.skip(); lw.step(1000 / 60, { render: false }); }
    const b = G.boss;
    // a virtual wall clock, so the check does not depend on how fast this machine draws
    let now = performance.now();
    performance.now = () => now;
    const out = {};
    for (const [name, hz, hitstop] of [['144 Hz', 144, 0], ['60 Hz with hit-stops', 60, 0.08]]) {
      let acc = 0, lead = 0;
      for (let f = 0; f < 240; f++) {
        if (hitstop && f % 20 === 0) G.hitstop = hitstop;
        acc += 1 / hz;
        while (acc >= 1 / 120) { acc -= 1 / 120; lw.step(1000 / 120, { render: false }); }
        now += 1000 / hz;
        R.draw(G, 1 / hz);
        const A = b.anim;
        if (A && A.dispSt != null && A._st === b.state) lead = Math.max(lead, A.dispSt - b.st);
      }
      out[name] = +lead.toFixed(3);
    }
    return out;
  });
  for (const [k, v] of Object.entries(r)) assert.ok(v < 0.02, `boss animation runs ${v}s ahead of its state at ${k}`);
  await painted(page);
  clean(page);
  await B.close(page);
});
