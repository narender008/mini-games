// Screenshot pass: every screen at 1280x800 and on a phone in portrait
// (390x844) and in landscape (844x390), into out/screens/
// with an index.html contact sheet. The game is set up through the hook
// (six friends in the meadow, a part-painted easel, the come-alive moment
// held at the peel and at the landing) and frozen for each shot. Fails if a
// screen cannot be reached, a frame is blank, or the page logs an error.
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const OUT = path.join(__dirname, 'out', 'screens');
const VIEWS = [
  { tag: 'desktop', width: 1280, height: 800, dpr: 1 },
  { tag: 'phone-portrait', width: 390, height: 844, dpr: 2, touch: true, mobile: true },
  { tag: 'phone-landscape', width: 844, height: 390, dpr: 2, touch: true, mobile: true },
];
// [name, screen expected, setup(mb, page)]
const SHOTS = [
  ['01-title', 'title', async (mb) => { await mb('screen', 'title'); await mb('thaw'); await G.sleep(900); }],
  ['02-pick', 'pick', async (mb) => { await mb('screen', 'pick'); await mb('thaw'); await G.sleep(700); }],
  ['03-paint-blank', 'paint', async (mb) => { await mb('pick', 'unicorn'); await mb('thaw'); await G.sleep(500); }],
  ['04-paint', 'paint', async (mb) => {
    await mb('pick', 'dragon');
    await mb('paint', [[0.3, 0.45], [0.7, 0.42], [0.35, 0.55], [0.68, 0.6]], 'green');
    await mb('paint', [[0.4, 0.3], [0.6, 0.35], [0.45, 0.62]], 'rainbow');
    await mb('paint', [[0.25, 0.7], [0.75, 0.72]], 'glitter');
    await mb('thaw'); await G.sleep(600);
  }],
  ['05-alive-sweep', 'alive', async (mb) => { await mb('freeze'); await mb('pick', 'kitten'); await mb('colourIn', ['orange', 'yellow', 'pink']); await mb('go'); await mb('step', 400); await mb('step', 700); }],
  ['06-alive-peel', 'alive', async (mb) => { await mb('freeze'); await mb('pick', 'puppy'); await mb('colourIn', ['brown', 'yellow', 'red']); await mb('go'); await mb('step', 400); await mb('step', 1950); }],
  ['07-alive-landed', 'alive', async (mb) => { await mb('freeze'); await mb('pick', 'fox'); await mb('colourIn', ['orange', 'purple']); await mb('go'); await mb('step', 400); await mb('step', 2800); }],
  ['08-meadow', 'meadow', async (mb, page) => {
    await mb('screen', 'meadow'); await mb('thaw');
    await page.waitForFunction(() => window.__mb.app.screens.meadow.ents.every((e) => e.actor && e.actor.rig), null, { timeout: 8000 });
    await G.sleep(1800); await mb('toy', 'bubbles'); await G.sleep(800);
  }],
  ['09-book', 'book', async (mb, page) => {
    await mb('screen', 'book'); await mb('thaw');
    await page.waitForFunction(() => { const b = window.__mb.app.screens.book; return [...b.portraits.values()].every((p) => p.actor); }, null, { timeout: 8000 });
    await G.sleep(600);
  }],
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));
  const server = await serve(process.env.MB_ROOT);
  const browser = await launch();
  const failures = [];
  const rows = [];
  try {
    for (const V of VIEWS) {
      const page = await open(browser, server.url, 'debug&seed=11', V);
      const mb = await hook(page);
      // six friends in the meadow and a seventh in the book
      for (const k of ['whale', 'bunny', 'dragon', 'unicorn', 'teddy', 'butterfly', 'penguin']) await G.makeFriend(mb, k);
      await G.sleep(500);
      for (const [name, screen, setup] of SHOTS) {
        const file = `${name}-${V.tag}.png`;
        try {
          await setup(mb, page);
          await mb('freeze');
          await mb('step', 16);
          const st = await mb('state');
          if (st.screen !== screen) throw new Error(`on '${st.screen}', wanted '${screen}'`);
          await page.screenshot({ path: path.join(OUT, file) });
          const s = await frameStats(page);
          if (s.std < 8 || s.colours < 40) throw new Error(`frame looks blank: ${JSON.stringify(s)}`);
          rows.push({ file, name, tag: V.tag, w: V.width, h: V.height });
          console.log(`ok   ${file}`);
        } catch (e) {
          failures.push(`${file}: ${e.message}`);
          console.log(`FAIL ${file}: ${e.message}`);
        }
        await mb('thaw');
      }
      if (page.problems.length) failures.push(`${V.tag}: page problems:\n${page.problems.join('\n')}`);
      await close(page);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Magic Brush screens</title>
<style>body{font:14px system-ui,sans-serif;background:#f6efe3;margin:16px}h2{margin:24px 0 8px}div{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0}img{max-width:420px;max-height:420px;border:1px solid #ccc;display:block}figcaption{color:#555}</style>
<h1>Magic Brush screens</h1>
${VIEWS.map((V) => `<h2>${V.tag} ${V.width}x${V.height}</h2><div>${rows.filter((r) => r.tag === V.tag).map((r) => `<figure><a href="${r.file}"><img src="${r.file}" loading="lazy"></a><figcaption>${r.name}</figcaption></figure>`).join('')}</div>`).join('\n')}`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`${rows.length} screenshots in ${OUT}`);
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
