// Shared setup for the node:test files: one static server and one Chromium
// per file, a page helper that records problems, and an assertion that a
// page stayed clean.
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./server.cjs');
const B = require('./browser.cjs');
const G = require('./game.cjs');

function suite() {
  const env = { server: null, browser: null };
  before(async () => { env.server = await serve(); env.browser = await B.launch(); });
  after(async () => { await env.browser?.close(); await env.server?.close(); });

  env.open = (query = '', opts) => B.open(env.browser, env.server.url, query, opts);
  // A debug page with the hook and saves on, in a fresh context (so storage
  // starts empty).
  env.debug = async (extra = '', opts) => {
    const page = await env.open(`debug&save=1${extra ? `&${extra}` : ''}`, opts);
    const lw = await G.hook(page);
    return { page, lw };
  };
  // Reopens the same context's page after a close, the way a player comes back.
  env.reopen = async (ctx, query = 'debug&save=1', opts = {}) => {
    const page = await ctx.newPage();
    page.problems = [];
    page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`console: ${m.text()}`); });
    await page.goto(`${env.server.url}${B.GAME}?${query}`, { waitUntil: 'load' });
    const lw = await G.hook(page);
    return { page, lw };
  };
  return env;
}

// LW_ALLOW=<regex> ignores matching problems (for a work-in-progress game
// that still 404s on modules not written yet); CI never sets it.
const ALLOW = process.env.LW_ALLOW ? [new RegExp(process.env.LW_ALLOW)] : [];
const clean = (page, allow = []) => {
  const p = page.problems.filter((x) => ![...allow, ...ALLOW].some((a) => a.test(x)));
  assert.deepEqual(p, [], `page reported problems:\n${p.join('\n')}`);
};

module.exports = { suite, clean, assert, B, G };
