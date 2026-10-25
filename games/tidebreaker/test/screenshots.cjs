// Screenshot pass: captures each scene at 1280x720 into out/screens/ with an
// index.html contact sheet for visual review. Fails if a core scene cannot be
// reached, a frame is blank, or the page logs an error.
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const OUT = path.join(__dirname, 'out', 'screens');
const LEGS = ['dawn', 'sunset', 'storm', 'fog', 'night'];

// Each shot: how to get there from a fresh ?debug page. core shots must work.
const SHOTS = [
  { name: '01-title', core: true, go: async () => {} },
  ...LEGS.map((leg, i) => ({ name: `0${i + 2}-play-${leg}`, core: true, go: async (tb) => { await tb('play', { seed: 7, leg: i + 1 }); await tb('freeze'); await tb('step', 6000); } })),
  { name: '07-cards', core: true, go: async (tb) => { await tb('play', { seed: 7, leg: 2 }); await tb('freeze'); await tb('step', 2000); await tb('cards'); } },
  { name: '08-paused', go: async (tb) => { await tb('play', { seed: 7, leg: 1 }); await tb('step', 0); await tb('pause', true); } },
  { name: '09-boss-serpent', core: true, go: async (tb) => { await tb('play', { seed: 7, leg: 4, node: 2 }); await tb('boss', 'serpent'); await tb('freeze'); await tb('step', 4000); } },
  { name: '10-boss-leviathan', core: true, go: async (tb) => { await tb('play', { seed: 7, leg: 5, node: 2 }); await tb('boss', 'leviathan'); await tb('freeze'); await tb('step', 4000); } },
  { name: '11-shop', go: async (tb, page) => { await page.click('#btn-shop', { timeout: 3000 }); } },
  { name: '12-lost', go: async (tb, page) => {
    await tb('play', { seed: 7, leg: 3 });
    await tb('freeze');
    await page.evaluate(() => { const tb = window.__tb; for (let i = 0; i < 900 && tb.state().scene !== 'lost'; i++) { if (tb.state().scene === 'cards') tb.choose(0); tb.step(1000); } });
  } },
  { name: '13-won', go: async (tb, page) => {
    await tb('play', { seed: 7, leg: 5, node: 2 });
    await tb('god', true); await tb('boss', 'leviathan'); await tb('freeze');
    await page.evaluate(() => { const tb = window.__tb; for (let i = 0; i < 600 && tb.state().scene !== 'won'; i++) { if (tb.state().scene === 'cards') tb.choose(0); tb.kill(); tb.step(500); } });
  } },
];
const EXPECT = { '07-cards': 'cards', '08-paused': 'paused', '11-shop': 'shop', '12-lost': 'lost', '13-won': 'won', '01-title': 'title' };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(process.env.TB_ROOT);
  const browser = await launch();
  const results = [];
  for (const shot of SHOTS) {
    const page = await open(browser, server.url, 'debug&seed=7');
    const r = { name: shot.name, core: !!shot.core };
    try {
      const tb = await hook(page);
      await shot.go(tb, page);
      await new Promise((r) => setTimeout(r, 500));
      const s = await tb('state');
      r.scene = s.scene;
      if (EXPECT[shot.name] && s.scene !== EXPECT[shot.name]) throw new Error(`landed on scene '${s.scene}', wanted '${EXPECT[shot.name]}'`);
      if (/boss/.test(shot.name) && !s.boss) throw new Error('no boss on the field');
      await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
      r.stats = await frameStats(page);
      if (r.stats.std < 10 || r.stats.colours < 60) throw new Error(`frame looks blank: ${JSON.stringify(r.stats)}`);
      if (page.problems.length) throw new Error(page.problems[0]);
      r.ok = true;
    } catch (e) { r.ok = false; r.error = e.message.split('\n')[0]; }
    results.push(r);
    console.log(`${r.ok ? 'ok  ' : (r.core ? 'FAIL' : 'warn')} ${shot.name}${r.error ? `: ${r.error}` : ''}`);
    await close(page);
  }
  // the phone layout, landscape and portrait
  for (const [name, w, h] of [['14-phone-landscape', 844, 390], ['15-phone-portrait', 390, 844]]) {
    const page = await open(browser, server.url, 'debug&seed=7', { width: w, height: h, touch: true, mobile: true });
    const r = { name, core: false };
    try {
      const tb = await hook(page);
      await tb('play', { seed: 7, leg: 2 }); await tb('freeze'); await tb('step', 4000);
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      r.stats = await frameStats(page);
      r.ok = r.stats.std > 10;
      if (!r.ok) r.error = 'blank frame';
    } catch (e) { r.ok = false; r.error = e.message.split('\n')[0]; }
    results.push(r);
    console.log(`${r.ok ? 'ok  ' : 'warn'} ${name}${r.error ? `: ${r.error}` : ''}`);
    await close(page);
  }
  await browser.close();
  await server.close();
  const html = `<!doctype html><meta charset="utf-8"><title>Tidebreaker screens</title><style>body{background:#111;color:#ddd;font:14px system-ui;margin:16px}figure{display:inline-block;margin:8px;vertical-align:top}img{width:640px;max-width:90vw;display:block;border:1px solid #333}figcaption{padding:4px 0}.bad{color:#f77}</style>${results.map((r) => `<figure><img src="${r.name}.png" alt="${r.name}"><figcaption class="${r.ok ? '' : 'bad'}">${r.name}${r.error ? ` – ${r.error}` : ''}</figcaption></figure>`).join('')}`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.ok && r.core);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} scenes captured to ${OUT}`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
