// Browser helpers shared by the smoke tests, the Ace tests and the screenshot
// pass. Chromium always runs with --mute-audio (AGENTS.md): sound is checked
// through the AudioContext, never played aloud. WebGL runs on SwiftShader (the
// software GL that CI has), so frames are slow: tests drive time through the
// ?debug hook's fixed steps, never by waiting on the wall clock.
let pw;
try { pw = require('playwright'); } catch { pw = require(require('path').join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); }

const GAME = '/games/rocket-blast/';
const ARGS = ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function launch() {
  const opts = { args: ARGS };
  if (process.env.RB_CHROMIUM) opts.executablePath = process.env.RB_CHROMIUM;
  return pw.chromium.launch(opts);
}

// Opens the game in a fresh context, waits for the start screen (the loader
// done, body[data-state] past 'loading') and records every console error, page
// error, failed same-origin request and request leaving the origin on
// page.problems. Every AudioContext the game makes is kept on window.__rbAudio.
async function open(browser, base, query = '', { width = 1440, height = 900, touch = false, mobile = false, ready = true, storage = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: mobile, deviceScaleFactor: 1 });
  await ctx.addInitScript((store) => {
    const A = window.AudioContext || window.webkitAudioContext;
    if (A) {
      window.__rbAudio = [];
      const Wrapped = class extends A { constructor(...a) { super(...a); window.__rbAudio.push(this); } };
      window.AudioContext = Wrapped;
      window.webkitAudioContext = Wrapped;
    }
    // a fresh device unless the test seeds saved settings
    if (store && !sessionStorage.getItem('__rbSeeded')) {
      for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v);
      sessionStorage.setItem('__rbSeeded', '1');
    }
  }, storage);
  // generous: CI and busy machines run SwiftShader slowly
  ctx.setDefaultTimeout(+process.env.RB_TIMEOUT || 120000);
  ctx.setDefaultNavigationTimeout(+process.env.RB_TIMEOUT || 120000);
  const page = await ctx.newPage();
  page.problems = [];
  // RB_ALLOW=<regex> drops matching problems everywhere (for a work-in-progress
  // build); CI never sets it.
  const allow = process.env.RB_ALLOW ? new RegExp(process.env.RB_ALLOW) : null;
  const push = page.problems.push.bind(page.problems);
  Object.defineProperty(page.problems, 'push', { enumerable: false, value: (...x) => push(...x.filter((m) => !(allow && allow.test(m)))) });
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!r.url().startsWith(base)) return;
    // src/boot.js pre-fetches the engine only to drive the progress bar and
    // drops each response once read; Chromium then sometimes reports that
    // finished stream as aborted. The module import loads the file for real.
    if (r.resourceType() === 'fetch' && r.failure()?.errorText === 'net::ERR_ABORTED' && /\/(vendor\/three\/|games\/rocket-blast\/src\/)/.test(r.url())) return;
    page.problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) page.problems.push(`http ${r.status()}: ${r.url()}`); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) page.problems.push(`external request: ${u}`); });
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  await page.goto(`${base}${GAME}${q}`, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { state: 'attached' });
  if (ready) await waitReady(page);
  return page;
}

// The loader is done once body[data-state] leaves 'loading' (SwiftShader
// compiles every shader up front, which takes a while).
async function waitReady(page, timeout = 180000) {
  await page.waitForFunction(() => {
    if (document.getElementById('loader')?.classList.contains('error')) return true;
    return document.body.dataset.state && document.body.dataset.state !== 'loading';
  }, null, { timeout, polling: 250 });
  const err = await page.evaluate(() => (document.getElementById('loader')?.classList.contains('error') ? document.getElementById('loader-text').textContent : null));
  if (err) throw new Error(`loader failed: ${err}`);
}

async function close(page) { await page.context().close(); }

// The largest visible canvas: the play field.
async function canvasBox(page) {
  return page.evaluate(() => {
    let best = null;
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width * r.height > (best ? best.w * best.h : 0) && getComputedStyle(c).visibility !== 'hidden') best = { x: r.x, y: r.y, w: r.width, h: r.height, cw: c.width, ch: c.height };
    }
    return best;
  });
}

// Pixel statistics of what is on screen now: mean and spread of luminance and
// the number of distinct colours (coarsely bucketed). A blank or flat frame has
// a tiny spread and a handful of colours.
async function frameStats(page, png) {
  png = (png || (await page.screenshot({ type: 'png' }))).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sum = 0, sq = 0;
    const buckets = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += l; sq += l * l; n++;
      buckets.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4));
    }
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), colours: buckets.size, width: c.width, height: c.height };
  }, png);
}

// Fraction of sampled pixels that differ between two screenshots.
async function frameDiff(page, a, b) {
  return page.evaluate(async ([A, B]) => {
    const load = async (s) => { const i = new Image(); i.src = `data:image/png;base64,${s}`; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const x = await load(A), y = await load(B);
    let n = 0, diff = 0;
    for (let i = 0; i < x.length; i += 4 * 11) { n++; if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > 24) diff++; }
    return diff / n;
  }, [a.toString('base64'), b.toString('base64')]);
}

// Real touch input through the DevTools protocol (Playwright only offers
// taps): a finger goes down, moves and lifts, in CSS pixels. Chromium lines
// pointer moves up with animation frames, which SwiftShader makes slow, so
// each call waits until the page has seen the pointer event it caused before
// the test steps the game.
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    if (window.__rbTouch) return;
    window.__rbTouch = { x: NaN, y: NaN, type: '' };
    for (const t of ['pointerdown', 'pointermove', 'pointerup']) addEventListener(t, (e) => { if (e.pointerType === 'touch') Object.assign(window.__rbTouch, { x: e.clientX, y: e.clientY, type: t }); }, true);
  });
  const seen = (type, x, y) => page.waitForFunction(([type, x, y]) => {
    const t = window.__rbTouch;
    return t.type === type && (x == null || (Math.abs(t.x - x) < 1.5 && Math.abs(t.y - y) < 1.5));
  }, [type, x, y], { polling: 20 });
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 })) });
  return {
    down: async (x, y) => { await send('touchStart', [[x, y]]); await seen('pointerdown', x, y); },
    move: async (x, y) => { await send('touchMove', [[x, y]]); await seen('pointermove', x, y); },
    up: async () => { await send('touchEnd', []); await seen('pointerup'); },
    detach: () => cdp.detach().catch(() => {}),
  };
}

// Moves the mouse and waits until the page has seen it arrive (pointer moves
// are lined up with animation frames, which are slow on SwiftShader).
async function mouseTo(page, x, y) {
  await page.evaluate(() => {
    if (window.__rbMouse) return;
    window.__rbMouse = { x: NaN, y: NaN };
    addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') Object.assign(window.__rbMouse, { x: e.clientX, y: e.clientY }); }, true);
  });
  await page.mouse.move(x, y, { steps: 4 });
  await page.waitForFunction(([x, y]) => Math.abs(window.__rbMouse.x - x) < 1.5 && Math.abs(window.__rbMouse.y - y) < 1.5, [x, y], { polling: 20 });
}

module.exports = { pw, launch, open, waitReady, close, canvasBox, frameStats, frameDiff, touch, mouseTo, GAME, ARGS };
