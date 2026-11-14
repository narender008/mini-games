// Staged screenshots of every part of the game, for review and the README:
// node screenshots.cjs [outdir]. Each scene is set up through the ?debug
// hook and frozen before the picture is taken.
const path = require('path');
const fs = require('fs');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats } = require('./lib/browser.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'screens'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wide = { width: 1600, height: 900 };

const scenes = [
  ['01-meadow', 'debug', wide, async (fm) => { await fm('step', 2500); await fm('want', 0); await fm('step', 600); }],
  ['02-baby-match', 'debug', wide, async (fm) => { await fm('step', 2500); await fm('want', 1); await fm('step', 500); const s = await fm('state'); const i = s.fruits.findIndex((f) => f.kind === s.babies[1].want); await fm('feed', i); await fm('step', 1450); }],
  ['03-party', 'debug', wide, async (fm) => { await fm('celebrate'); await fm('step', 2800); }],
  ['04-bath', 'debug', wide, async (fm, page) => {
    await fm('activity', 'bath'); await fm('step', 900);
    const m = (await fm('state')).monster;
    await page.mouse.move(m.x - m.R * 0.5, m.y - m.R * 0.4); await page.mouse.down();
    for (let i = 0; i < 26; i++) await page.mouse.move(m.x + (i % 2 ? 0.5 : -0.5) * m.R, m.y - m.R * (0.2 + (i % 4) * 0.12));
    await fm('step', 300);
  }],
  ['05-teeth', 'debug', wide, async (fm, page) => {
    await fm('activity', 'teeth'); await fm('step', 1200);
    const g = (await fm('state')).act.germs[0];
    await page.mouse.move(g.x, g.y); await page.mouse.down(); for (let i = 0; i < 6; i++) await page.mouse.move(g.x + (i % 2 ? 25 : -25), g.y);
    await fm('step', 200);
  }],
  ['06-dress', 'debug', wide, async (fm) => { await fm('activity', 'dress'); await fm('step', 800); for (const id of ['crown', 'glasses', 'bow']) { await fm('wear', id); await fm('step', 700); } }],
  ['07-phone', 'debug', { width: 390, height: 844, touch: true, mobile: true, scale: 3 }, async (fm) => { await fm('step', 2500); await fm('want', 0); await fm('step', 600); }],
  ['08-tablet-party', 'debug', { width: 1024, height: 768, touch: true, scale: 2 }, async (fm) => { await fm('celebrate'); await fm('step', 2600); }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(process.env.FM_ROOT);
  const browser = await launch();
  let ok = true;
  for (const [name, query, opts, stage] of scenes) {
    const page = await open(browser, server.url, query, opts);
    const fm = await hook(page);
    await sleep(300);
    await fm('freeze');
    await stage(fm, page);
    await sleep(150);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    const s = await frameStats(page);
    const good = s.std > 15 && s.colours > 120 && page.problems.length === 0;
    if (!good) ok = false;
    console.log(`${good ? 'ok  ' : 'BAD '} ${name}  colours=${s.colours} std=${s.std.toFixed(1)}${page.problems.length ? '  ' + page.problems.join('; ') : ''}`);
    await close(page);
  }
  await browser.close();
  await server.close();
  console.log(`screens: ${OUT}`);
  process.exit(ok ? 0 : 1);
})();
