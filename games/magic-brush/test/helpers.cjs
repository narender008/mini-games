// Shared helpers for the Magic Brush browser tests.
//
// Chromium runs headless on SwiftShader (no GPU on CI runners), where one
// frame takes one to five seconds. So every page is frozen the moment the
// debug API appears (?debug exposes window.__mb) and the tests drive time
// with __mb.step(ms): one call advances the world by ms and renders once.
// Some work runs on wall-clock time (friend meshing in a worker, the magic's
// prepare step, coverage read-backs): poll with until() and small real waits.
//
// The site is served by a tiny static server started here (or by run.cjs,
// which passes MB_URL). Math.random is seeded so runs repeat, the frame
// governor is switched off (seconds-long frames would make it lower the
// render scale and thin the fur), and audio is muted (AGENTS.md).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(__dirname, 'out');
const ARGS = ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const LONG = 15 * 60 * 1000;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2' };

// a static file server for the repo root, no caching; resolves to its base URL
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      fs.readFile(file, (err, data) => {
        if (err) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      server.unref();
      resolve({ url: `http://127.0.0.1:${server.address().port}/`, server });
    });
  });
}

let base = process.env.MB_URL ? Promise.resolve(process.env.MB_URL) : null;
const baseUrl = () => (base ??= serve().then((s) => s.url));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Before any page script: a seeded Math.random, and __mb frozen (and the governor
// stood down) as soon as the game publishes it.
function initScript() {
  let a = 12345;
  Math.random = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // (Start asks for full screen: a headless window that goes full screen can no longer be resized)
  Element.prototype.requestFullscreen = () => Promise.resolve();
  Element.prototype.webkitRequestFullscreen = () => Promise.resolve();
  Object.defineProperty(window, '__mb', {
    configurable: true,
    get() {
      return this.__mb_;
    },
    set(v) {
      this.__mb_ = v;
      v.freeze();
      if (v.app?.governor) v.app.governor.sample = () => {};
    },
  });
}

// Opens the game on a fresh page. opts: query (appended after ?debug), width,
// height, mobile (touch + phone UA), keepStorage (a context to reuse).
async function open(opts = {}) {
  const { query = '', width = 1280, height = 720, mobile = false } = opts;
  const url = await baseUrl();
  const browser = opts.browser || (await chromium.launch({ args: ARGS }));
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(LONG);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', (m) => {
    const t = m.text();
    // (SwiftShader chatter, not the game's)
    if (/KHR_parallel_shader_compile|GPU stall|WebGL: too many errors|Automatic fallback to software WebGL/i.test(t)) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + t);
  });
  await page.addInitScript(initScript);
  const mb = {
    browser,
    context,
    page,
    errors,
    ev: (fn, arg) => page.evaluate(fn, arg),
    // advance the world by ms and render once
    step: (ms = 16) => page.evaluate((ms) => window.__mb.step(ms), ms),
    state: () => page.evaluate(() => window.__mb.state()),
    stats: () => page.evaluate(() => window.__mb.stats()),
    friends: () => page.evaluate(() => window.__mb.friends()),
    // polls fn(arg) in the page until it is truthy (false after ms)
    async until(fn, arg, ms = 120000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await page.evaluate(fn, arg)) return true;
        await wait(150);
      }
      return false;
    },
    // the magic to its end: prepare runs on the clock, the sweep and the leap are stepped
    async comeAlive() {
      const started = await mb.until(() => {
        const s = window.__mb.state();
        return s.magic === 'sweep' || s.magic === 'alive';
      }, null, 180000);
      if (!started) return false;
      for (let i = 0; i < 30; i++) {
        const s = await page.evaluate(() => {
          window.__mb.step(800);
          return window.__mb.state();
        });
        if (!s.magic && !s.busy) return true;
        await wait(20);
      }
      return false;
    },
    // a Little-ones friend picked, coloured in and brought to life (true once it is in the garden)
    async paintFriend(id, colors = ['red', 'yellow', 'blue']) {
      await page.evaluate(() => window.__mb.play());
      await page.evaluate((id) => window.__mb.pickTap(id), id);
      const ready = await mb.until((id) => {
        const s = window.__mb.state();
        return s.canvasFriend === id && s.subjectReady;
      }, id);
      if (!ready) return false;
      await page.evaluate((colors) => {
        document.getElementById('picker').hidden = true;
        window.__mb.step(1600);
        window.__mb.colourIn(colors, 12);
      }, colors);
      await page.evaluate(() => window.__mb.go());
      if (!(await mb.comeAlive())) return false;
      return page.evaluate((id) => window.__mb.friends().some((f) => f.kind === id), id);
    },
    // a doodle preset drawn and, with go, brought to life through the GO button
    async doodle(preset, { go = true } = {}) {
      await page.evaluate((p) => window.__mb.doodle(p), preset);
      await page.evaluate(() => window.__mb.step(100));
      if (!go) return true;
      await settle();
      await page.evaluate(() => window.__mb.tap('go'));
      return mb.comeAlive();
    },
    // until the double-tap guard lets the current screen's buttons through again
    settle: () => settle(),
    async shot(name, opts = {}) {
      fs.mkdirSync(OUT, { recursive: true });
      const file = path.join(OUT, name.endsWith('.png') || name.endsWith('.jpg') ? name : name + '.png');
      await page.screenshot({ path: file, timeout: LONG, ...opts });
      return file;
    },
    async reload() {
      await page.reload();
      await waitMenu(page);
    },
    async close() {
      await context.close().catch(() => {});
      if (!opts.browser) await browser.close().catch(() => {});
    },
  };
  const settle = () => wait(950);
  await page.goto(`${url}games/magic-brush/?debug${query}`, { timeout: LONG });
  await waitMenu(page);
  return mb;
}

async function waitMenu(page) {
  await page.waitForFunction(() => window.__mb && window.__mb.state().state === 'menu', null, { timeout: LONG, polling: 250 });
  // (the loader fades out on the clock)
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 30000, polling: 250 }).catch(() => {});
}

// buttons of a container that are shown, with their boxes
function boxesIn(selector) {
  const vis = (el) => el.offsetParent !== null && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  return [...document.querySelectorAll(selector)].filter(vis).map((b) => {
    const r = b.getBoundingClientRect();
    return { id: b.id || [b.className.split(' ').slice(0, 2).join('.'), b.dataset.color || b.dataset.kind || b.dataset.size || b.dataset.toy || ''].filter(Boolean).join(':'), x: r.x, y: r.y, w: r.width, h: r.height };
  });
}

// pairs of boxes that overlap by more than 2 px both ways
function overlaps(boxes) {
  const out = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) out.push(`${a.id} x ${b.id}`);
    }
  return out;
}

// page errors that matter (the game's own)
function realErrors(errors) {
  return errors.filter((e) => !/Failed to load resource.*favicon/i.test(e));
}

module.exports = { open, serve, wait, boxesIn, overlaps, realErrors, ARGS, OUT, ROOT, chromium };
