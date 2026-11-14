// Browser helpers shared by every browser test. Chromium always runs with --mute-audio (AGENTS.md): sound
// is checked through the AudioContext, never played aloud. Every page records console errors, page errors,
// failed or 4xx/5xx same-origin requests and any request that leaves the local server on page.problems.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const GAME = '/games/last-light/';
const OUT = path.join(__dirname, '..', 'out');
const SHOTS = path.join(OUT, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

function launch() { return chromium.launch({ args: ['--mute-audio'] }); }

/** Starts the server and the browser once per test file; returns { base, browser, done }. */
async function setup() {
  const srv = await serve();
  const browser = await launch();
  return { base: srv.url, browser, done: async () => { await browser.close(); await srv.close(); } };
}

async function open(browser, base, query = '', { width = 1280, height = 720, init, storage } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (storage) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } }, storage);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.problems = [];
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (r.url().startsWith(base)) page.problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) page.problems.push(`http ${r.status()}: ${r.url()}`); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) page.problems.push(`external request: ${u}`); });
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  await page.goto(`${base}${GAME}${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('done'), null, { timeout: 60000 });
  return page;
}

async function close(page) { await page.context().close(); }

/** The ?debug hook: lt('state'), lt('step', 500)... Results are copied out as JSON. */
async function hook(page, timeout = 30000) {
  await page.waitForFunction(() => window.__lt && typeof window.__lt.state === 'function', null, { timeout });
  return (name, ...args) => page.evaluate(([n, a]) => {
    const f = window.__lt[n];
    if (typeof f !== 'function') throw new Error(`__lt.${n} is not a function`);
    const v = f.apply(window.__lt, a);
    return v === undefined || typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype ? null : JSON.parse(JSON.stringify(v));
  }, [name, args]);
}

/** Polls fn (in Node) until it returns truthy or the time runs out. */
async function until(fn, timeout = 10000, step = 100, what = 'condition') {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

/** Player position and a few facts read straight off the world. */
function player(page) {
  return page.evaluate(() => { const w = window.__lt.world(), p = w.player; return { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, state: p.state, dashCharges: p.dashCharges, aim: p.aim, time: w.time, runTime: w.run.time }; });
}

async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** Pixel statistics of the current frame: a blank or flat frame has a tiny spread and few colours. */
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

module.exports = { GAME, OUT, SHOTS, launch, setup, open, close, hook, until, player, shot, frameStats };
