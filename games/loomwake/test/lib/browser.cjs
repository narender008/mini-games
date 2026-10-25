// Browser helpers shared by the smoke tests, the bot and the screenshot pass.
// Chromium always runs with --mute-audio (AGENTS.md): sound is checked through
// the AudioContext, never played aloud.
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }

const GAME = '/games/loomwake/';

async function launch() {
  const opts = { args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] };
  if (process.env.LW_CHROMIUM) opts.executablePath = process.env.LW_CHROMIUM;
  return pw.chromium.launch(opts);
}

// Opens the game in a fresh context and records every console error, page
// error and failed same-origin request on page.problems.
async function open(browser, base, query = '', { width = 1280, height = 720, touch = false, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: mobile, deviceScaleFactor: 1 });
  // Records every AudioContext the game makes on window.__lwAudio, so sound
  // can be checked without playing it.
  await ctx.addInitScript(() => {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    window.__lwAudio = [];
    const Wrapped = class extends A { constructor(...a) { super(...a); window.__lwAudio.push(this); } };
    window.AudioContext = Wrapped;
    window.webkitAudioContext = Wrapped;
  });
  const page = await ctx.newPage();
  page.problems = [];
  // LW_ALLOW=<regex> drops matching problems everywhere (a work-in-progress
  // game that still 404s on modules not written yet); CI never sets it.
  const allow = process.env.LW_ALLOW ? new RegExp(process.env.LW_ALLOW) : null;
  const push = page.problems.push.bind(page.problems);
  page.problems.push = (...x) => push(...x.filter((m) => !(allow && allow.test(m))));
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (r.url().startsWith(base)) page.problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) page.problems.push(`http ${r.status()}: ${r.url()}`); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) page.problems.push(`external request: ${u}`); });
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  await page.goto(`${base}${GAME}${q}`, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { state: 'attached', timeout: 15000 });
  return page;
}

async function close(page) { await page.context().close(); }

// Waits for the ?debug hook and returns a caller: lw('state'), lw('step', 500),
// lw('save.export')... Dotted names reach into nested objects.
async function hook(page, timeout = 15000) {
  await page.waitForFunction(() => window.__lw && typeof window.__lw.state === 'function', null, { timeout });
  // the contract allows scene 'loading' at boot: wait it out so callers see the title (or ?play's run)
  await page.waitForFunction(() => { try { return window.__lw.state().scene !== 'loading'; } catch { return false; } }, null, { timeout }).catch(() => {});
  return (name, ...args) => page.evaluate(async ([n, a]) => {
    const parts = n.split('.');
    let self = window.__lw;
    for (const p of parts.slice(0, -1)) self = self && self[p];
    const f = self && self[parts[parts.length - 1]];
    if (typeof f !== 'function') {
      if (f !== undefined && !a.length) return JSON.parse(JSON.stringify(f));
      throw new Error(`__lw.${n} is not a function`);
    }
    const v = await f.apply(self, a);
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }, [name, args]);
}

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

module.exports = { pw, launch, open, close, hook, canvasBox, frameStats, frameDiff, GAME };
