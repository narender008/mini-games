// Performance, measured the way the brief sets the bar: headless Chromium with
// --disable-gpu at 1280x800, devicePixelRatio 1. After a warm-up, frames are
// counted with requestAnimationFrame for MB_PERF_SECS (default 6) seconds:
//  - the meadow with six friends, bubbles and the ball in the air
//  - the easel while a mouse paints non-stop
// Both must hold MB_FPS_MIN fps (default 50; CI sets a lower floor because
// shared runners are slower). __mb.perf() must agree. Then ten paint ->
// meadow cycles must not grow the JS heap (after GC) beyond MB_HEAP_MB
// (default 16 MB). Numbers are written to out/perf.json.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, cdp } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const FPS_MIN = Number(process.env.MB_FPS_MIN || 50);
const SECS = Number(process.env.MB_PERF_SECS || 6);
const HEAP_MB = Number(process.env.MB_HEAP_MB || 16);
const OUT = path.join(__dirname, 'out');
const results = { fpsMin: FPS_MIN, secs: SECS };

let server, browser;
before(async () => { server = await serve(process.env.MB_ROOT); browser = await launch(); });
after(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(results, null, 2));
  await browser?.close(); await server?.close();
});

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);

// a page whose requestAnimationFrame callbacks are timed, so the report shows
// how much of each frame the game's own work takes (the headroom under 16.7 ms)
async function timedPage(query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__work = [];
    window.requestAnimationFrame = (cb) => raf((ts) => { const t = performance.now(); try { cb(ts); } finally { const w = window.__work; w.push(performance.now() - t); if (w.length > 2000) w.shift(); } });
  });
  return open(browser, server.url, query, { context: ctx });
}
const work = (page) => page.evaluate(() => { const w = window.__work.slice(-300).sort((a, b) => a - b); return { workP50: Math.round(w[Math.floor(w.length * 0.5)] * 100) / 100, workP95: Math.round(w[Math.floor(w.length * 0.95)] * 100) / 100 }; });

// counts animation frames in the page for `secs` seconds
const countFrames = (page, secs) => page.evaluate((secs) => new Promise((res) => {
  const times = [];
  const t0 = performance.now();
  const f = (ts) => { times.push(ts); if (ts - t0 < secs * 1000) requestAnimationFrame(f); else {
    const d = []; for (let i = 1; i < times.length; i++) d.push(times[i] - times[i - 1]);
    d.sort((a, b) => a - b);
    res({ fps: (times.length - 1) / ((times[times.length - 1] - times[0]) / 1000), p50: d[Math.floor(d.length * 0.5)], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1], frames: times.length });
  } };
  requestAnimationFrame(f);
}), secs);
const r1 = (x) => Math.round(x * 10) / 10;

test(`meadow with six friends and toys holds >= ${FPS_MIN} fps at 1280x800`, async () => {
  const page = await timedPage('debug&seed=5');
  const mb = await hook(page);
  for (const k of ['dragon', 'unicorn', 'puppy', 'whale', 'teddy', 'blank']) await G.makeFriend(mb, k);
  await G.waitReady(page, 'meadow');
  await page.waitForFunction(() => window.__mb.app.screens.meadow.ents.filter((e) => e.actor && e.actor.rig).length === 6, null, { timeout: 8000 });
  await mb('toy', 'bubbles');
  await mb('toy', 'ball');
  await G.sleep(2500); // warm-up
  const toys = setInterval(() => { mb('toy', 'bubbles').catch(() => {}); }, 1500);
  const m = await countFrames(page, SECS);
  clearInterval(toys);
  const perf = await mb('perf');
  const st = await mb('state');
  results.meadow = { fps: r1(m.fps), p50: r1(m.p50), p95: r1(m.p95), maxMs: r1(m.max), ...(await work(page)), perf, friends: st.meadow.length, bubbles: st.toys.bubbles };
  console.log(`meadow: ${JSON.stringify(results.meadow)}`);
  assert.equal(st.meadow.length, 6);
  assert.ok(m.fps >= FPS_MIN, `meadow ran at ${m.fps.toFixed(1)} fps (floor ${FPS_MIN})`);
  assert.ok(perf.fps >= FPS_MIN, `__mb.perf() says ${perf.fps} fps`);
  assert.equal(perf.canvasPx, 1280 * 800, 'canvas should be 1280x800 at dpr 1');
  clean(page);
  await close(page);
});

test(`painting on the easel holds >= ${FPS_MIN} fps at 1280x800`, async () => {
  const page = await timedPage('debug&pick=dragon');
  const mb = await hook(page);
  await G.waitReady(page, 'paint');
  const p = await G.pageRect(page);
  let painting = true, moves = 0;
  // a mouse painting non-stop: long loops over the page, a pot change now and then
  const brush = (async () => {
    let a = 0, pots = 0;
    while (painting) {
      await page.mouse.move(p.x + p.w * 0.5, p.y + p.h * 0.5);
      await page.mouse.down();
      for (let i = 0; i < 40 && painting; i++) {
        a += 0.35;
        await page.mouse.move(p.x + p.w * (0.5 + 0.38 * Math.cos(a) * Math.sin(a * 0.31)), p.y + p.h * (0.5 + 0.4 * Math.sin(a * 1.3)));
        moves++;
        await G.sleep(8);
      }
      await page.mouse.up();
      if (++pots % 3 === 0) await G.tap(page, G.SEL.pot(G.POTS[pots % 10]), 'mouse');
    }
  })();
  await G.sleep(2000); // warm-up
  const m = await countFrames(page, SECS);
  const perf = await mb('perf');
  const wk = await work(page);
  painting = false;
  await brush;
  const st = await mb('state');
  results.paint = { fps: r1(m.fps), p50: r1(m.p50), p95: r1(m.p95), maxMs: r1(m.max), ...wk, perf, moves, coverage: st.coverage };
  console.log(`paint: ${JSON.stringify(results.paint)}`);
  assert.ok(moves > 100, `the brush barely moved (${moves})`);
  assert.ok(st.coverage > 0.3, `the painting did not progress (${st.coverage})`);
  assert.ok(m.fps >= FPS_MIN, `painting ran at ${m.fps.toFixed(1)} fps (floor ${FPS_MIN})`);
  assert.ok(perf.fps >= FPS_MIN, `__mb.perf() says ${perf.fps} fps`);
  clean(page);
  await close(page);
});

test(`ten paint -> meadow cycles grow the JS heap by under ${HEAP_MB} MB`, async () => {
  const page = await open(browser, server.url, 'debug', { width: 1280, height: 800, dpr: 1 });
  const mb = await hook(page);
  const s = await cdp(page);
  await s.send('HeapProfiler.enable');
  const heap = async () => { for (let i = 0; i < 2; i++) await s.send('HeapProfiler.collectGarbage'); return (await s.send('Runtime.getHeapUsage')).usedSize / 1048576; };
  const kinds = [...G.KINDS, 'blank'];
  const cycle = async (i) => {
    await G.makeFriend(mb, kinds[i % kinds.length]);
    await page.waitForFunction(() => window.__mb.app.screens.meadow.ents.filter((e) => e.state !== 'leave').every((e) => e.actor && e.actor.rig), null, { timeout: 8000 });
    await mb('toy', 'bubbles');
    await G.sleep(400);
    await mb('screen', 'book');
    await G.sleep(250);
  };
  // two warm-up cycles fill the caches (meadow of six is not full yet: fill it)
  for (let i = 0; i < 6; i++) await cycle(i);
  const base = await heap();
  const samples = [];
  for (let i = 6; i < 16; i++) { await cycle(i); samples.push(Math.round(await heap() * 10) / 10); }
  const end = samples[samples.length - 1];
  results.heap = { baseMB: Math.round(base * 10) / 10, afterMB: samples, growthMB: Math.round((end - base) * 10) / 10, boundMB: HEAP_MB };
  console.log(`heap: ${JSON.stringify(results.heap)}`);
  assert.ok(end - base < HEAP_MB, `heap grew ${(end - base).toFixed(1)} MB over 10 cycles (${base.toFixed(1)} -> ${end.toFixed(1)} MB)`);
  // and it is not climbing steadily: the second half grows less than the bound's half
  assert.ok(samples[9] - samples[4] < HEAP_MB / 2, `heap still climbing: ${samples.join(', ')}`);
  clean(page);
  await close(page);
});
