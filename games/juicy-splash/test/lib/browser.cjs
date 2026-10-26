// Browser helpers shared by the smoke tests and the screenshot pass. Chromium
// always runs with --mute-audio (AGENTS.md): sound is checked through the
// AudioContext and the music scheduler's note count, never played aloud.
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }

const GAME = '/games/juicy-splash/';

async function launch() {
  const opts = { args: ['--mute-audio'] };
  if (process.env.JS_CHROMIUM) opts.executablePath = process.env.JS_CHROMIUM;
  return pw.chromium.launch(opts);
}

// Opens the game in a fresh context and records every console error, page
// error, failed request and any request that leaves the site on page.problems.
async function open(browser, base, query = '', { width = 1280, height = 720, touch = false, mobile = false, scale = 1, storage } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: mobile, deviceScaleFactor: scale, storageState: storage });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (r.url().startsWith(base)) page.problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) page.problems.push(`http ${r.status()}: ${r.url()}`); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) page.problems.push(`external request: ${u}`); });
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  await page.goto(`${base}${GAME}${q}`, { waitUntil: 'load' });
  await page.waitForSelector('#scene', { state: 'attached', timeout: 15000 });
  return page;
}
async function close(page) { await page.context().close(); }

// Waits for the ?debug hook and returns a caller: js('state'), js('step', 500)...
async function hook(page, timeout = 15000) {
  await page.waitForFunction(() => window.__js && typeof window.__js.state === 'function', null, { timeout });
  return (name, ...args) => page.evaluate(async ([n, a]) => {
    const f = window.__js[n];
    if (typeof f !== 'function') throw new Error(`__js.${n} is not a function`);
    const v = await f.apply(window.__js, a);
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }, [name, args]);
}

// Pixel statistics of the screen: spread of luminance and number of coarse
// colours. A blank or flat frame has a tiny spread and few colours.
async function frameStats(page) {
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sum = 0, sq = 0; const buckets = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; sq += l * l; n++; buckets.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4)); }
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), colours: buckets.size };
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

module.exports = { pw, launch, open, close, hook, frameStats, frameDiff, GAME };
