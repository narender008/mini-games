// Staged screenshots of every part of the game, for review and the README:
// node screenshots.cjs [outdir]. Each scene is set up through the ?debug hook
// and frozen before the picture is taken.
const path = require('path');
const fs = require('fs');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats } = require('./lib/browser.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'screens'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDE = { width: 1600, height: 900 };

const scenes = [
  ['01-title', 'debug&seed=8', WIDE, async (js) => { await js('step', 2600); }],
  ['02-reef', 'debug&play&seed=3', WIDE, async (js) => {
    await js('goto', 900, 0.45); await js('step', 600);
    const p = await js('subScreen'); await js('press', p.x + 520, p.y - 40); await js('step', 450);
  }],
  ['03-tickle', 'debug&play&seed=3', WIDE, async (js) => { await js('goto', 380, 0.35); await js('step', 300); await js('tickle', 'octopus'); await js('step', 120); await js('tickle', 'clown'); await js('step', 250); }],
  ['04-kelp-wreck', 'debug&play&seed=4', WIDE, async (js) => { await js('goto', 2350, 0.5); await js('step', 900); await js('honk'); await js('step', 300); }],
  ['05-coral-garden', 'debug&play&seed=5', WIDE, async (js) => { await js('goto', 3550, 0.55); await js('step', 1200); }],
  ['06-glow-cave', 'debug&play&seed=6', WIDE, async (js) => { await js('goto', 5150, 0.48); await js('step', 1500); }],
  ['07-treasure', 'debug&play&seed=6', WIDE, async (js) => { await js('goto', 5600, 0.7); await js('step', 1800); }],
  ['08-party', 'debug&play&seed=7', WIDE, async (js) => { await js('goto', 2600, 0.5); await js('findAll'); await js('step', 2600); }],
  ['09-phone-portrait', 'debug&play&seed=5', { width: 390, height: 844, touch: true, mobile: true, scale: 3 }, async (js) => { await js('goto', 1050, 0.4); await js('step', 700); await js('tickle', 'clown'); await js('step', 250); }],
  ['10-tablet', 'debug&play&seed=9', { width: 1024, height: 768, touch: true, scale: 2 }, async (js) => { await js('goto', 3700, 0.55); await js('step', 1000); }],
  ['11-hint', 'debug&play&seed=2', { width: 1280, height: 720 }, async (js) => { await js('step', 7300); }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(process.env.BS_ROOT);
  const browser = await launch();
  let ok = true;
  for (const [name, query, opts, stage] of scenes) {
    const page = await open(browser, server.url, query, opts);
    const js = await hook(page);
    await sleep(300);
    await js('bakeAll');
    await stage(js);
    await js('freeze'); await sleep(150);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    const s = await frameStats(page);
    const good = s.std > 15 && s.colours > 120 && page.problems.length === 0;
    if (!good) ok = false;
    console.log(`${good ? 'ok  ' : 'BAD '} ${name}  colours=${s.colours} spread=${s.std.toFixed(1)}${page.problems.length ? '  ' + page.problems.join('; ') : ''}`);
    await close(page);
  }
  await browser.close(); await server.close();
  console.log(`screenshots in ${OUT}`);
  process.exit(ok ? 0 : 1);
})();
