// Browser helpers shared by every test file and the screenshot pass.
// Chromium always runs with --mute-audio (AGENTS.md) and --disable-gpu (the
// brief's performance bar is set without a GPU). Every browser is closed by
// the file that launched it.
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }

const GAME = '/games/magic-brush/';

async function launch() {
  const opts = { args: ['--mute-audio', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] };
  if (process.env.MB_CHROMIUM) opts.executablePath = process.env.MB_CHROMIUM;
  return pw.chromium.launch(opts);
}

// Opens the game in a fresh context and records every console error, page
// error, unhandled rejection, failed same-origin request and any request that
// leaves the local server on page.problems; page.requests lists every URL.
async function open(browser, base, query = '', { width = 1280, height = 800, touch = false, mobile = false, dpr = 1, context = null } = {}) {
  const ctx = context || await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: mobile, deviceScaleFactor: dpr });
  await ctx.addInitScript(() => {
    window.addEventListener('unhandledrejection', (e) => console.error(`unhandledrejection: ${e.reason && (e.reason.stack || e.reason.message) || e.reason}`));
    // every screen shown, in order (body[data-screen]), so a test can prove a
    // mashed button made exactly one transition
    window.__screens = [];
    const start = () => {
      const b = document.body;
      if (b.dataset.screen) window.__screens.push(b.dataset.screen);
      new MutationObserver(() => { const s = b.dataset.screen; if (window.__screens[window.__screens.length - 1] !== s) window.__screens.push(s); })
        .observe(b, { attributes: true, attributeFilter: ['data-screen'] });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  });
  const page = await ctx.newPage();
  watch(page, base);
  await goto(page, base, query);
  return page;
}

function watch(page, base) {
  page.problems = [];
  page.requests = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.problems.push(`console ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (r.url().startsWith(base)) page.problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) page.problems.push(`http ${r.status()}: ${r.url()}`); });
  page.on('request', (r) => {
    const u = r.url();
    page.requests.push(u);
    if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) page.problems.push(`external request: ${u}`);
  });
}

async function goto(page, base, query = '') {
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  await page.goto(`${base}${GAME}${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.screen && document.body.dataset.screen !== 'loading', null, { timeout: 15000 });
}

async function close(page) { await page.context().close(); }

// Waits for the ?debug hook and returns a caller: mb('state'), mb('step', 500)...
async function hook(page, timeout = 15000) {
  await page.waitForFunction(() => window.__mb && typeof window.__mb.state === 'function', null, { timeout });
  return (name, ...args) => page.evaluate(async ([n, a]) => {
    const f = window.__mb[n];
    if (typeof f !== 'function') throw new Error(`__mb.${n} is not a function`);
    const v = await f.apply(window.__mb, a);
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }, [name, args]);
}

// Real touch input through the DevTools protocol: a drag is one finger going
// down, moving in steps and lifting, so the page sees pointerType 'touch'.
async function cdp(page) {
  if (!page._cdp) page._cdp = await page.context().newCDPSession(page);
  return page._cdp;
}
async function touchDrag(page, pts, { id = 1, stepMs = 16 } = {}) {
  const s = await cdp(page);
  const tp = ([x, y]) => [{ x, y, id, radiusX: 8, radiusY: 8, force: 1 }];
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) });
  for (const p of pts.slice(1)) {
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) });
    if (stepMs) await new Promise((r) => setTimeout(r, stepMs));
  }
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function mouseDrag(page, pts, { steps = 3 } = {}) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps });
  await page.mouse.up();
}

// Pixel statistics of what is on screen now: mean and spread of luminance and
// the number of distinct colours (coarsely bucketed).
async function frameStats(page) {
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
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
    return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), colours: buckets.size };
  }, png);
}

module.exports = { pw, launch, open, goto, watch, close, hook, cdp, touchDrag, mouseDrag, frameStats, GAME };
