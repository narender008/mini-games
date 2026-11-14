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

// visitors placed where a picture shows them well
async function friends(gg, s) {
  await gg('clearVisitors');
  const W = s.W, H = s.H;
  await gg('spawn', 'butterfly', { x: W * 0.3, y: H * 0.3 });
  await gg('spawn', 'butterfly', { x: W * 0.62, y: H * 0.22 });
  await gg('spawn', 'bee', { x: W * 0.45, y: H * 0.35 });
  await gg('spawn', 'ladybug', {});
  await gg('spawn', 'bird'); await gg('spawn', 'bunny');
  await gg('set', 'bunny', { s: 'sit', t: 0, sitFor: 99, x: W * 0.8, y: s.portrait ? H * 0.7 : H * 0.958 });
}

const scenes = [
  ['01-title', 'debug&seed=8', WIDE, async (gg) => { await gg('quiet'); await gg('step', 2600); }],
  ['02-planting', 'debug&play&seed=3', WIDE, async (gg) => {
    await gg('quiet');
    const s = await gg('state');
    await gg('tap', s.patches[0].x, s.patches[0].y); await gg('step', 900);
    await gg('tap', s.patches[1].x, s.patches[1].y); await gg('step', 640);
    await gg('tap', s.patches[2].x, s.patches[2].y); await gg('step', 280);
    await gg('spawn', 'worm', { patch: 4 });
    await gg('tap', s.patches[3].x, s.patches[3].y); await gg('step', 150);
  }],
  ['03-water-and-bloom', 'debug&play&seed=3', WIDE, async (gg) => {
    await gg('quiet');
    const s = await gg('state');
    await gg('button', 'seed'); await gg('step', 1800);
    await gg('grow', 0); await gg('grow', 0); await gg('grow', 1);
    await gg('grow', 3); await gg('step', 700);
    let st = await gg('state');
    await gg('tap', st.patches[2].head.x, st.patches[2].head.y); await gg('step', 650);
    st = await gg('state');
    await gg('tap', st.patches[3].head.x, st.patches[3].head.y); await gg('step', 220);
  }],
  ['04-garden-friends', 'debug&play&seed=5', WIDE, async (gg) => {
    await gg('quiet');
    await gg('fill', 4); await gg('step', 400);
    const s = await gg('state');
    await friends(gg, s);
    await gg('spawn', 'balloon'); await gg('step', 6200);
    const st = await gg('state');
    await gg('tap', st.patches[1].head.x, st.patches[1].head.y); await gg('step', 250);
  }],
  ['05-rain-and-rainbow', 'debug&play&seed=6', WIDE, async (gg) => {
    await gg('quiet');
    await gg('button', 'seed'); await gg('step', 1500);
    await gg('rain'); await gg('step', 5400);
    await gg('rain'); await gg('step', 1400);
  }],
  ['06-garden-party', 'debug&play&seed=7', WIDE, async (gg) => { await gg('quiet'); await gg('fill'); await gg('step', 2700); }],
  ['07-phone-portrait', 'debug&play&seed=5', { width: 390, height: 844, touch: true, mobile: true, scale: 3 }, async (gg) => {
    await gg('quiet');
    await gg('fill', 2); await gg('step', 500);
    const s = await gg('state');
    await gg('tap', s.patches[2].x, s.patches[2].y); await gg('step', 900);
    await gg('spawn', 'butterfly', { x: 300, y: 200 }); await gg('step', 1500);
    const st = await gg('state');
    await gg('tap', st.patches[2].head.x, st.patches[2].head.y); await gg('step', 300);
  }],
  ['08-tablet', 'debug&play&seed=9', { width: 1024, height: 768, touch: true, scale: 2 }, async (gg) => { await gg('fill', 3); await gg('step', 9000); }],
  ['09-hint', 'debug&play&seed=2', { width: 1280, height: 720 }, async (gg) => { await gg('quiet'); await gg('step', 7000); }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(process.env.GG_ROOT);
  const browser = await launch();
  let ok = true;
  const only = process.argv.slice(3);
  for (const [name, query, opts, stage] of scenes) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    const page = await open(browser, server.url, query, opts);
    const gg = await hook(page);
    await gg('freeze');
    await sleep(200);
    await stage(gg);
    await gg('render'); await sleep(150);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    const s = await frameStats(page);
    const good = s.std > 15 && s.colours > 150 && page.problems.length === 0;
    if (!good) ok = false;
    console.log(`${good ? 'ok  ' : 'BAD '} ${name}  colours=${s.colours} spread=${s.std.toFixed(1)}${page.problems.length ? '  ' + page.problems.join('; ') : ''}`);
    await close(page);
  }
  await browser.close(); await server.close();
  console.log(`screenshots in ${OUT}`);
  process.exit(ok ? 0 : 1);
})();
