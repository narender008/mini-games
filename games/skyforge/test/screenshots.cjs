// Screenshots of every screen at 1280x720 (plus phone portrait and
// landscape) into out/screens/, with an index.html contact sheet and
// results.json. A shot that cannot be reached is listed as missing; the step
// fails if any shot is missing, flat, or the page logs errors. SF_SHOTS_DIR
// copies the shots somewhere else too (e.g. the project files).
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, frameStats } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const OUT = path.join(__dirname, 'out', 'screens');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE_L = { width: 844, height: 390, touch: true, mobile: true };
const PHONE_P = { width: 390, height: 844, touch: true, mobile: true };

// A preset colony, live for a moment so smoke, walkers and ships are moving.
const colony = (preset, extra = async () => {}) => async (p, sf) => {
  await sf('play', { seed: 21, preset });
  await G.waitScene(sf, 'colony', 10000);
  await extra(p, sf);
  await sleep(1500);
  // the new-game chapter banner covers the middle for a few seconds
  await p.waitForFunction(() => !document.querySelector('#chapter-banner.on'), null, { polling: 200, timeout: 20000 }).catch(() => {});
};
const screen = (preset, name) => colony(preset, async (p, sf) => { await sf('open', name); await G.waitScene(sf, name === 'build' ? ['build', 'colony'] : name, 4000); });

const SHOTS = [
  ['01-title', '', async () => {}],
  ['02-profiles', 'debug', async (p, sf) => { await G.clickOr(p, [G.SEL.profiles], null, 3000); await G.waitScene(sf, 'profiles', 4000); await sleep(400); }],
  ['02b-new-colony', 'debug', async (p, sf) => { await G.clickOr(p, [G.SEL.new], null, 3000); await G.waitVisible(p, [G.SEL.start], 3000); await sleep(400); }],
  ['03-first-landing', 'debug', colony('fresh')],
  ['04-early-colony', 'debug', colony('early')],
  ['05-mid-colony', 'debug', colony('mid')],
  ['06-late-colony', 'debug', colony('late')],
  ['07-dusk', 'debug', colony('mid', async (p, sf) => { await sf('time', 0.74); })],
  ['08-night', 'debug', colony('late', async (p, sf) => { await sf('time', 0.95); })],
  ['09-storm', 'debug', colony('storm', async (p, sf) => { await sf('weather', 'storm', 1); await sleep(1500); })],
  ['10-raid', 'debug', colony('raid', async (p, sf) => { await sf('freeze'); await sf('raid', 2); await G.stepUntil(p, 's => s.threat.raid && s.threat.raid.active', { ms: 120000, chunk: 500 }); await G.stepUntil(p, '() => (window.__sf.game.pirates || []).length > 0 && window.__sf.game.raid && window.__sf.game.raid.phase === "attack"', { ms: 120000, chunk: 500 }); await sf('step', 6000, { render: true }); await sf('thaw'); })],
  ['11-build-palette', 'debug', screen('mid', 'build')],
  ['12-placing', 'debug', colony('mid', async (p, sf) => { const s = await sf('state'); await sf('open', 'build'); const item = await G.waitVisible(p, [G.SEL.buildItem('cottage'), G.SEL.buildItem()], 3000); if (item) await item.click(); const home = G.homeIsland(s); const type = item ? await item.getAttribute('data-build') : 'cottage'; const sp = await G.spot(sf, type, home); if (sp) { const xy = await sf('toScreen', home, sp.x, sp.y); await p.mouse.move(xy.x, xy.y); } })],
  ['13-inspector', 'debug', colony('mid', async (p, sf) => { const s = await sf('state'); const b = s.buildings.find((x) => /smelter|workshop|sawmill/.test(x.type)) || s.buildings[0]; await sf('select', b.id); await G.waitVisible(p, [G.SEL.inspector], 3000); })],
  ['14-research', 'debug', screen('mid', 'research')],
  ['15-sky-chart', 'debug', screen('late', 'chart')],
  ['16-fleet', 'debug', screen('late', 'fleet')],
  ['17-event-card', 'debug', colony('early', async (p, sf) => { await sf('freeze'); await G.stepUntil(p, 's => !!s.event', { ms: 3 * 3600000, chunk: 10000, events: false }); await sf('thaw'); })],
  ['18-skyforge', 'debug', colony('late', async (p, sf) => { await sf('view', 'glimmerreach', 1.2); })],
  ['19-paused', 'debug', colony('mid', async (p, sf) => { await p.keyboard.press(G.KEYS.menu); await G.waitScene(sf, 'paused', 3000); })],
  ['20-settings', 'debug', async (p, sf) => { await G.clickOr(p, [G.SEL.settings], null); await G.waitScene(sf, 'settings', 3000); await sleep(400); }],
  ['21-won', 'debug', colony('late', async (p, sf) => { await sf('win'); await G.waitScene(sf, 'won', 20000); await sleep(1500); })],
  ['22-codex', 'debug', async (p, sf) => { await G.clickOr(p, [G.SEL.codex], null); await sleep(800); }],
  ['23-phone-landscape', 'debug&touch', colony('mid'), PHONE_L],
  ['24-phone-portrait', 'debug&touch', colony('mid'), PHONE_P],
  ['25-phone-research', 'debug&touch', screen('mid', 'research'), PHONE_L],
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await launch();
  const results = [];
  const only = process.argv.slice(2);
  try {
    for (const [name, query, setup, opts] of SHOTS) {
      if (only.length && !only.some((o) => name.includes(o))) continue;
      const page = await open(browser, server.url, query, opts);
      const r = { name, ok: false };
      try {
        const sf = query.includes('debug') ? await G.hook(page) : null;
        if (!sf) await sleep(1800);
        else await setup(page, sf);
        const file = path.join(OUT, `${name}.png`);
        await page.screenshot({ path: file });
        r.stats = await frameStats(page);
        r.ok = r.stats.std > 8 && r.stats.colours > 40;
        if (!r.ok) r.why = `flat frame ${JSON.stringify(r.stats)}`;
        if (sf) r.scene = (await sf('state')).scene;
      } catch (e) { r.why = e.message.split('\n')[0]; }
      r.problems = page.problems.slice(0, 5);
      if (r.problems.length) { r.ok = false; r.why = (r.why ? `${r.why}; ` : '') + r.problems.join(' | '); }
      results.push(r);
      console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${name}${r.why ? `: ${r.why}` : ''}`);
      await close(page);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Skyforge screens</title><style>body{background:#111;color:#eee;font:14px system-ui;margin:16px}figure{display:inline-block;margin:8px;vertical-align:top}img{width:420px;border:1px solid #333}figcaption{padding:4px 0}.bad{color:#f77}</style>${results.map((r) => `<figure><img src="${r.name}.png" alt="${r.name}"><figcaption class="${r.ok ? '' : 'bad'}">${r.name}${r.ok ? '' : ` — ${r.why || 'failed'}`}</figcaption></figure>`).join('')}`);
  if (process.env.SF_SHOTS_DIR) {
    fs.mkdirSync(process.env.SF_SHOTS_DIR, { recursive: true });
    for (const f of fs.readdirSync(OUT)) fs.copyFileSync(path.join(OUT, f), path.join(process.env.SF_SHOTS_DIR, f));
  }
  const bad = results.filter((r) => !r.ok);
  if (bad.length) { console.log(`\nFAIL: ${bad.map((r) => r.name).join(', ')}`); process.exit(1); }
  console.log(`PASS: ${results.length} screens in ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
