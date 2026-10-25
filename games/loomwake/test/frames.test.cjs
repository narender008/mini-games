// Frame-loop tests: smooth motion on any display refresh, no black frame when
// the resolution changes, a pixel budget on retina and 4K screens, a loop that
// survives a throwing frame, and a quality governor that settles instead of
// see-sawing. The browser tests drive requestAnimationFrame from a synthetic
// vsync clock (60 Hz, 144 Hz ... with a little wobble, like a real one), so
// they check the loop's maths, not the cloud machine's speed.
const { test } = require('node:test');
const path = require('path');
const { pathToFileURL } = require('url');
const { suite, assert, G } = require('./lib/suite.cjs');
const env = suite();
const { sleep } = G;

// Replaces rAF with a virtual display at `hz`. Each vsync calls the game's
// callback with the virtual time, then records what the frame did: the hero
// position as drawn (frames().hx) and whether the main canvas was resized
// after its last paint in that frame (a cleared canvas reaching the screen).
const vsync = (hz) => {
  const period = 1000 / hz;
  let vt = performance.now();
  const q = [];
  window.__vs = { drawn: [], blank: 0, frames: 0, resizes: 0 };
  let last = null;
  const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    get() { return desc.get.call(this); },
    set(v) { if (this.id === 'scene' && v !== desc.get.call(this)) { last = 'resize'; window.__vs.resizes++; } desc.set.call(this, v); },
    configurable: true,
  });
  const fill = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (...a) { if (this.canvas.id === 'scene') last = 'paint'; return fill.apply(this, a); };
  window.requestAnimationFrame = (f) => { q.push(f); return q.length; };
  const pump = () => {
    vt += period + (Math.random() - 0.5) * 0.6;
    last = null;
    for (const f of q.splice(0)) { try { f(vt); } catch (e) { /* the game's own problem */ } }
    const S = window.__vs;
    S.frames++;
    if (last === 'resize') S.blank++;
    const L = window.__lw && window.__lw.frames ? window.__lw.frames() : null;
    const fr = L && L[L.length - 1];
    const h = window.__lwG && window.__lwG.hero;
    const G = window.__lwG;
    // only frames where she is free to run: in a chamber, no hit-stop, no stagger, nothing paused
    if (fr && h) S.drawn.push([fr.hx != null ? fr.hx : h.x, G.scene === 'run' && !G.paused && !(G.hitstop > 0) && !h.dead ? h.vx : 0, h.state, fr.steps]);
    setTimeout(pump, 1);
  };
  setTimeout(pump, 1);
};

async function vsyncPage(hz, query, opts) {
  const page = await env.browser.newContext({ viewport: { width: 1280, height: 720 }, ...(opts || {}) }).then((c) => c.newPage());
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  await page.context().addInitScript(vsync, hz);
  await page.goto(`${env.server.url}/games/loomwake/?${query}`, { waitUntil: 'load' });
  const lw = await G.hook(page, 40000);
  return { page, lw };
}

for (const hz of [60, 144]) {
  test(`Iri moves on screen every frame at ${hz} Hz (render interpolation)`, async () => {
    const { page, lw } = await vsyncPage(hz, 'debug&play&seed=3&quality=low&scale=0.6&mute');
    await G.waitScene(lw, G.RUN_SCENES, 40000);
    await lw('god', true); await lw('clear');
    // runs back and forth around the entry, well clear of the walls
    await page.evaluate(() => {
      const h = window.__lwG.hero, x0 = h.x;
      let d = 1;
      window.__lw.input({ move: { x: d, y: 0 } });
      window.__zig = setInterval(() => { const nd = h.x > x0 + 110 ? -1 : h.x < x0 - 110 ? 1 : d; if (nd !== d) { d = nd; window.__lw.input({ move: { x: d, y: 0 } }); } }, 20);
    });
    await sleep(500);
    await page.evaluate(() => { window.__vs.drawn.length = 0; });
    await sleep(5000);
    const xs = await page.evaluate(() => { clearInterval(window.__zig); return window.__vs.drawn.slice(); });
    let still = 0, moved = 0;
    const stills = [];
    // a frame where she has running speed but is drawn exactly where the previous frame put her
    for (let i = 1; i < xs.length; i++) { if (Math.abs(xs[i][1]) < 60 || Math.abs(xs[i - 1][1]) < 60) continue; const dx = Math.abs(xs[i][0] - xs[i - 1][0]); if (dx > 0.05) moved++; else if (dx < 1e-6) { still++; stills.push(xs[i - 1].slice(2).concat(xs[i].slice(2))); } }
    await lw('input', null);
    assert.ok(moved > 20, `too few frames measured (${moved})`);
    // without interpolation a 144 Hz screen shows ~1 frame in 6 with no movement, and 60 Hz drops some too
    assert.ok(still / (still + moved) < 0.03, `${still} of ${still + moved} frames drew Iri standing still while she ran: ${JSON.stringify(stills.slice(0, 8))}`);
    assert.deepEqual(page.problems, []);
    await page.context().close();
  });
}

test('a resolution change never leaves a cleared canvas on screen', async () => {
  // a 25 Hz "display" reads as slow: the governor drops the resolution scale and then the tier
  const { page, lw } = await vsyncPage(25, 'debug&play&seed=3&mute');
  await G.waitScene(lw, G.RUN_SCENES, 40000);
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < 25000) { s = await page.evaluate(() => ({ ...window.__vs, drawn: 0 })); if (s.resizes >= 2) break; await sleep(500); }
  assert.ok(s.resizes >= 1, `the quality governor never changed the resolution (${JSON.stringify(s)})`);
  assert.equal(s.blank, 0, `${s.blank} frame(s) ended with a freshly cleared canvas`);
  await page.context().close();
});

test('the canvas stays inside its pixel budget on a retina screen', async () => {
  const { page, lw } = await vsyncPage(60, 'debug&play&seed=3&quality=high&scale=1&mute', { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await G.waitScene(lw, G.RUN_SCENES, 40000);
  await sleep(300);
  const c = await page.evaluate(() => { const c = document.getElementById('scene'); return { w: c.width, h: c.height }; });
  assert.ok(c.w * c.h <= 2.45e6, `canvas is ${c.w}x${c.h} (${(c.w * c.h / 1e6).toFixed(1)} MP)`);
  assert.ok(c.w >= 1600, `canvas fell below the CSS size: ${c.w}x${c.h}`);
  await page.context().close();
});

test('a frame that throws does not stop the game loop', async () => {
  const { page, lw } = await vsyncPage(60, 'debug&play&seed=3&quality=low&mute');
  await G.waitScene(lw, G.RUN_SCENES, 40000);
  const t0 = (await lw('state')).time;
  await page.evaluate(() => {
    const R = window.__lw.renderer, draw = R.draw;
    let n = 0;
    R.draw = (...a) => { if (n++ < 8) throw new Error('painter blew up (test)'); return draw(...a); };
  });
  await sleep(1500);
  const s = await lw('state');
  assert.ok(s.time > t0 + 0.1, `sim clock stuck after a throwing frame (${t0} -> ${s.time})`);
  await page.context().close();
});

// ---------------------------------------------------------------- governor, in Node
async function governor(opts) {
  const { createQuality } = await import(pathToFileURL(path.join(__dirname, '../src/render/quality.js')).href);
  return createQuality(opts);
}
// runs `secs` of frames; interval(Q) gives the frame time for the current settings
function run(Q, secs, interval, work = () => 4) {
  let t = 0, changes = 0;
  while (t < secs * 1000) { const ms = interval(Q, t); if (Q.frame(ms, work(Q, t))) changes++; t += ms; }
  return changes;
}

test('governor: settles on a 144 Hz screen instead of swinging between levels', async () => {
  const Q = await governor({});
  // full resolution runs at ~45 fps, anything lower at ~100 fps: the old governor climbed and dropped every ~6 s
  const changes = run(Q, 180, (q) => (q.scale >= 1 && q.tier === 'high' ? 22 : 6.9 + Math.random() * 3));
  assert.ok(changes <= 6, `${changes} quality switches in 3 minutes`);
});

test('governor: a steady 50 Hz or 60 Hz screen keeps full quality', async () => {
  for (const ms of [20, 16.7]) {
    const Q = await governor({});
    const changes = run(Q, 60, () => ms + (Math.random() - 0.5) * 0.8);
    assert.equal(changes, 0, `${changes} switches at a steady ${ms} ms`);
    assert.equal(Q.tier, 'high'); assert.equal(Q.scale, 1);
  }
});

test('governor: one-off spikes (chamber repaint, GC, tab switch) do not drop quality', async () => {
  const Q = await governor({});
  const changes = run(Q, 60, (q, t) => (Math.floor(t / 1000) % 3 === 0 && t % 1000 < 17 ? 180 : 16.7));
  assert.equal(changes, 0, `${changes} switches from isolated spikes`);
});

test('governor: still drops quality when frames really are slow, and climbs back on a 60 Hz screen', async () => {
  const Q = await governor({});
  let slow = true;
  run(Q, 5, () => (slow ? 30 : 16.7));
  assert.ok(Q.scale < 1 || Q.tier === 'low', 'a steady 30 ms frame did not lower the quality');
  slow = false;
  run(Q, 60, () => 16.7, () => 3);
  assert.ok(Q.scale === 1, `never climbed back to full resolution with lots of headroom (scale ${Q.scale})`);
});
