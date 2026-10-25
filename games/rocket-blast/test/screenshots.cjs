// Screenshot pass: the kids' modes at 1440x900 and on a 390x844 phone (the
// zoomed-out camera), and Ace Pilot: the menu with its card, the sector map,
// every sector mid-wave, every boss, the upgrade pick, pause, the win and fail
// results, and the phone layout. Writes out/screens/*.png with an index.html
// contact sheet. Fails if a core shot cannot be reached, its frame is blank,
// or the page logs an error. Ace shots are skipped while its modules are
// missing (see lib/game.cjs).
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, frameStats } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const OUT = path.join(__dirname, 'out', 'screens');
const results = [];

const step = (page, ms) => page.evaluate((ms) => window.__rb.step(ms), ms);
const aceStep = (page, ms, render = true) => page.evaluate(([ms, render]) => window.__rb.ace.step(ms, { render }), [ms, render]);
// renders the frozen app once more so the canvas holds the latest state
const aceRender = (page) => aceStep(page, 16, true);

async function shot(page, name, { core = true, check } = {}) {
  const r = { name, core };
  try {
    if (check) await check();
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    r.stats = await frameStats(page);
    if (r.stats.std < 6 || r.stats.colours < 40) throw new Error(`frame looks blank: ${JSON.stringify(r.stats)}`);
    if (page.problems.length) throw new Error(page.problems.splice(0).join(' | '));
    r.ok = true;
  } catch (e) { r.ok = false; r.error = e.message.split('\n')[0]; }
  results.push(r);
  console.log(`${r.ok ? 'ok  ' : (r.core ? 'FAIL' : 'warn')} ${name}${r.error ? `: ${r.error}` : ''}`);
  return r.ok;
}

// Runs a block of shots on one page; an exception marks the rest as failed.
async function section(names, fn) {
  try { await fn(); } catch (e) {
    const done = new Set(results.map((r) => r.name));
    for (const n of names.filter((n) => !done.has(n))) {
      results.push({ name: n, core: true, ok: false, error: e.message.split('\n')[0] });
      console.log(`FAIL ${n}: ${e.message.split('\n')[0]}`);
    }
  }
}

async function kids(browser, base, w, h, prefix, phone) {
  const opts = { width: w, height: h, touch: phone, mobile: phone };
  const names = ['menu', 'little', 'big', 'free'].map((n) => `${prefix}-${n}`);
  await section(names, async () => {
    const page = await open(browser, base, 'debug&world=sunny&style=blocks&weapon=laser', opts);
    const rb = await G.hook(page);
    await rb('freeze');
    await step(page, 1500);
    await shot(page, names[0]);
    for (const [i, mode] of ['little', 'big', 'free'].entries()) {
      await page.evaluate(() => window.__rb.app.toMenu());
      await G.press(page, `.mode[data-mode="${mode}"]`, { tap: phone });
      await G.press(page, '#play', { tap: phone });
      // fly about and blast for a few seconds
      await page.evaluate((mode) => {
        const rb = window.__rb;
        for (let i = 0; i < 30; i++) {
          rb.pointer(Math.sin(i * 0.4) * 5, -rb.app.field.halfH * 0.6, mode === 'big', 'mouse');
          rb.step(200);
          if (i % 6 === 5) rb.hitFirst();
        }
        rb.pointer(0, 0, false, 'mouse');
      }, mode);
      await shot(page, names[i + 1]);
    }
    await close(page);
  });
}

async function ace(browser, base) {
  const missing = G.aceMissing();
  if (missing.length) {
    console.log(`skip Ace Pilot shots: modules not landed yet: ${missing.join(', ')}`);
    results.push({ name: 'ace (skipped)', core: false, ok: true, error: `not landed: ${missing.join(', ')}` });
    return;
  }
  const SEC = [1, 2, 3, 4, 5];
  const names = ['20-ace-menu-card', '21-ace-map', ...SEC.map((n) => `2${n + 1}-ace-sector${n}-wave`), ...SEC.map((n) => `3${n - 1}-ace-sector${n}-boss`), '35-ace-upgrade', '36-ace-paused', '37-ace-win', '38-ace-fail'];
  await section(names, async () => {
    const page = await open(browser, base, 'debug&seed=11');
    const rb = await G.hook(page);
    await rb('freeze');
    await G.press(page, '.mode[data-mode="ace"]');
    await step(page, 500);
    await shot(page, names[0]);
    await G.press(page, '#play');
    await G.waitVisible(page, '#ace-map', 60000);
    await G.ace(page);
    await page.waitForFunction(() => { const a = window.__rb.app; return a.world === a.worlds[a.worldId]; }, null, { timeout: 60000 });
    await step(page, 300);
    await shot(page, names[1]);
    const ready = () => page.waitForFunction(() => { const a = window.__rb.app; return a.worldId?.startsWith('ace:') && a.world === a.worlds[a.worldId]; }, null, { timeout: 60000 });
    for (const n of SEC) {
      await page.evaluate((n) => { const A = window.__rb.ace; A.play(n, { wave: 3 + (n % 3) }); A.god(true); A.auto(true); }, n);
      await ready();
      await aceStep(page, 7000, false);
      await aceRender(page);
      await shot(page, names[1 + n], { check: async () => { const s = await G.aceState(page); if (!s.enemies && !s.bullets) throw new Error(`sector ${n}: empty field mid-wave (phase ${s.phase})`); } });
    }
    for (const n of SEC) {
      await page.evaluate((n) => { const A = window.__rb.ace; A.play(n, { boss: true }); A.god(true); A.auto(true); }, n);
      await ready();
      await G.aceUntil(page, (S) => !!S.boss, { maxSec: 20, sliceMs: 250 });
      await aceStep(page, 6000, false);
      await aceRender(page);
      await shot(page, names[6 + n], { check: async () => { if (!(await G.aceState(page)).boss) throw new Error('no boss on the field'); } });
    }
    // upgrade pick after wave 1
    await page.evaluate(() => { const A = window.__rb.ace; A.auto(false); A.play(2); A.god(true); });
    await ready();
    await G.aceUntil(page, (S, screen) => screen === 'upgrade', { maxSec: 180, sliceMs: 250, killEach: true });
    await aceRender(page);
    await G.waitVisible(page, '#ace-upgrade', 5000);
    await shot(page, names[12]);
    await page.evaluate(() => window.__rb.ace.choose());
    // pause
    await aceStep(page, 2000, false);
    await page.keyboard.press('Escape');
    await G.waitVisible(page, '#ace-paused', 5000);
    await aceRender(page);
    await shot(page, names[13]);
    await page.evaluate(() => window.__rb.ace.pause(false));
    // win: sector 1's boss, finished off
    await page.evaluate(() => { const A = window.__rb.ace; A.play(1, { boss: true }); A.god(true); A.auto(true); });
    await ready();
    await G.aceUntil(page, (S) => !!S.boss, { maxSec: 20, sliceMs: 250 });
    await G.aceUntil(page, (S, screen) => screen === 'result', { maxSec: 120, sliceMs: 250, killEach: true });
    await aceRender(page);
    await G.waitVisible(page, '#ace-result', 5000);
    await shot(page, names[14]);
    // fail: no god mode, bullets parked on the fighter
    await page.evaluate(() => { const A = window.__rb.ace; A.auto(false); A.god(false); A.play(3); });
    await ready();
    await G.aceUntil(page, (S) => S.bullets.length > 0, { maxSec: 30, sliceMs: 100 });
    await page.evaluate(() => {
      const A = window.__rb.ace;
      for (let i = 0; i < 400 && A.screen() !== 'result'; i++) {
        const S = A.state(), p = S.player;
        if (S.phase !== 'dead') { p.invuln = 0; p.shield = 0; p.shields = 0; const b = S.bullets[0]; if (b) S.bullets.push({ ...b, x: p.x, y: p.y, vx: 0, vy: 0, t: 0 }); }
        A.step(50, { render: false });
      }
    });
    await aceRender(page);
    await G.waitVisible(page, '#ace-result', 5000);
    await shot(page, names[15]);
    await close(page);
  });
  // phone portrait: map and a sector in flight, by touch
  const phone = ['40-ace-phone-map', '41-ace-phone-play', '42-ace-phone-boss'];
  await section(phone, async () => {
    const page = await open(browser, base, 'debug&mode=ace&seed=11', { width: 390, height: 844, touch: true, mobile: true });
    const rb = await G.hook(page);
    await rb('freeze');
    await G.press(page, '#play', { tap: true });
    await G.waitVisible(page, '#ace-map', 60000);
    await G.ace(page);
    await page.waitForFunction(() => { const a = window.__rb.app; return a.world === a.worlds[a.worldId]; }, null, { timeout: 60000 });
    await step(page, 300);
    await shot(page, phone[0]);
    await G.press(page, '.ace-sector[data-id="belt"]', { tap: true });
    await G.press(page, '#ace-launch', { tap: true });
    if ((await page.evaluate(() => window.__rb.ace.screen())) !== 'play') throw new Error('Launch on the sector map did not start the sector');
    await page.evaluate(() => { const A = window.__rb.ace; A.god(true); A.auto(true); });
    await page.waitForFunction(() => { const a = window.__rb.app; return a.world === a.worlds[a.worldId]; }, null, { timeout: 60000 });
    await aceStep(page, 12000, false);
    await aceRender(page);
    await shot(page, phone[1]);
    await page.evaluate(() => { const A = window.__rb.ace; A.play(4, { boss: true }); });
    await page.waitForFunction(() => { const a = window.__rb.app; return a.world === a.worlds[a.worldId]; }, null, { timeout: 60000 });
    await aceStep(page, 6000, false);
    await aceRender(page);
    await shot(page, phone[2]);
    await close(page);
  });
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(process.env.RB_ROOT);
  const browser = await launch();
  try {
    await kids(browser, server.url, 1440, 900, '0', false);
    await kids(browser, server.url, 390, 844, '1', true);
    await ace(browser, server.url);
  } finally {
    await browser.close();
    await server.close();
  }
  const shots = results.filter((r) => fs.existsSync(path.join(OUT, `${r.name}.png`)) || !r.ok);
  const html = `<!doctype html><meta charset="utf-8"><title>Rocket Blast screens</title><style>body{background:#111;color:#ddd;font:14px system-ui;margin:16px}figure{display:inline-block;margin:8px;vertical-align:top}img{max-width:640px;max-height:520px;display:block;border:1px solid #333}figcaption{padding:4px 0}.bad{color:#f77}</style><h1>Rocket Blast screens</h1>${shots.map((r) => `<figure>${fs.existsSync(path.join(OUT, `${r.name}.png`)) ? `<a href="${r.name}.png"><img src="${r.name}.png" alt="${r.name}"></a>` : ''}<figcaption class="${r.ok ? '' : 'bad'}">${r.name}${r.error ? ` – ${r.error}` : ''}</figcaption></figure>`).join('')}`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.ok && r.core);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} shots captured to ${OUT}`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
