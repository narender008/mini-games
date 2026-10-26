// Staged screenshots of every part of the game, for review and the README:
// node screenshots.cjs [outdir]. Each scene is set up through the ?debug hook
// and frozen before the picture is taken.
const path = require('path');
const fs = require('fs');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats } = require('./lib/browser.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'screens'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scenes = [
  ['01-title', 'debug&seed=8', { width: 1600, height: 900 }, async (js) => { await js('step', 2600); }],
  ['02-fruit-flying', 'debug&play&seed=3', { width: 1600, height: 900 }, async (js) => {
    await js('noSpawn'); await js('clear');
    for (const [k, x, y] of [['watermelon', 520, 330], ['pineapple', 860, 230], ['dragonfruit', 1180, 380], ['banana', 760, 560], ['pomegranate', 330, 560]]) await js('spawn', k, x, y);
  }],
  ['03-swipe-splat', 'debug&play&seed=3', { width: 1600, height: 900 }, async (js) => {
    await js('noSpawn'); await js('clear'); await js('fill', 4); await js('step', 1000);
    for (const [k, x, y] of [['watermelon', 560, 380], ['orange', 960, 300], ['mango', 1250, 520], ['plum', 330, 280]]) await js('spawn', k, x, y);
    await js('swipe', 260, 520, 1120, 250, 16); await js('step', 130);
  }],
  ['04-celebration', 'debug&play&seed=3', { width: 1600, height: 900 }, async (js) => { await js('noSpawn'); await js('clear'); await js('fill'); await js('step', 2600); }],
  ['05-all-fruits', 'debug&play&cover&seed=3', { width: 1600, height: 900 }, async (js) => {
    await js('noSpawn'); await js('clear');
    const kinds = ['watermelon', 'orange', 'lemon', 'apple', 'strawberry', 'kiwi', 'peach', 'pear', 'plum', 'pineapple', 'banana', 'mango', 'dragonfruit', 'pomegranate'];
    kinds.forEach((k, i) => { const row = i < 7 ? 0 : 1, col = i % 7; });
    for (let i = 0; i < kinds.length; i++) { const row = Math.floor(i / 7), col = i % 7; await js('spawn', kinds[i], 230 + col * 190, 250 + row * 230); }
  }],
  ['06-phone-portrait', 'debug&play&seed=5', { width: 390, height: 844, touch: true, mobile: true, scale: 3 }, async (js) => {
    await js('noSpawn'); await js('clear'); await js('fill', 5); await js('step', 1000);
    for (const [k, x, y] of [['apple', 120, 330], ['strawberry', 270, 450], ['pear', 200, 600], ['peach', 290, 230]]) await js('spawn', k, x, y);
    await js('swipe', 40, 520, 340, 380, 12); await js('step', 120);
  }],
  ['07-tablet', 'debug&play&seed=9', { width: 1024, height: 768, touch: true, scale: 2 }, async (js) => { await js('step', 9000); await js('fill', 7); await js('step', 900); }],
  ['08-hint', 'debug&play&seed=2', { width: 1280, height: 720 }, async (js) => { await js('noSpawn'); await js('clear'); await js('spawn', 'orange', 640, 300); await js('step', 7300); }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(process.env.JS_ROOT);
  const browser = await launch();
  let ok = true;
  for (const [name, query, opts, stage] of scenes) {
    const page = await open(browser, server.url, query, opts);
    const js = await hook(page);
    await sleep(300);
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
