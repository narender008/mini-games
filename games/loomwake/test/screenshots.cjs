// Screenshots of every scene at 1280x720 (plus phone landscape) into
// out/screens/, with an index.html contact sheet and results.json. A shot
// that cannot be reached is listed as missing; the step fails if any shot
// is missing, flat, or the page logs errors. LW_SHOTS_DIR copies the shots
// somewhere else too (e.g. the project files).
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, frameStats } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const OUT = path.join(__dirname, 'out', 'screens');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Puts the game into a scene with the hook, lets it run live for a moment so
// effects and animation are mid-flight, then shoots.
const SHOTS = [
  ['01-title', '', async () => {}],
  ['02-profiles', 'debug', async (p, lw) => { if (await G.waitVisible(p, [G.SEL.profile(0)], 1500)) return; await G.clickOr(p, [G.SEL.new, G.SEL.continue]); await G.waitScene(lw, 'profiles', 4000); }],
  ['03-hub', 'debug', async (p, lw) => { await G.titleToHub(p, lw, 0); await sleep(800); }],
  ['04-hub-dialogue', 'debug', async (p, lw) => { await G.titleToHub(p, lw, 0); const c = await lw('content'); const who = (c.dialogue || []).map((l) => l.speaker).find((s) => /orrin/i.test(s)) || 'orrin'; await lw('talk', who); await G.waitScene(lw, 'dialogue', 4000); await sleep(900); }],
  ...G.REGIONS.map((g, i) => [`${String(5 + i).padStart(2, '0')}-combat-${g}`, `debug&seed=${40 + i}`, async (p, lw) => { await lw('region', g); await G.waitScene(lw, G.RUN_SCENES, 8000); await lw('god', true); await fight(lw, 2600); }]),
  ['09-boons', 'debug&seed=9', async (p, lw) => { await lw('play', { seed: 9 }); await G.waitScene(lw, G.RUN_SCENES, 8000); await lw('clear'); await G.waitScene(lw, ['boons'], 8000).catch(async () => { await lw('freeze'); await G.stepUntil(p, 's => s.offer && s.offer.length', { ms: 8000 }); await lw('thaw'); }); await sleep(900); }],
  ['10-shop', 'debug', async (p, lw) => { if (!(await reach(p, lw, 'shop'))) throw new Error('no shop chamber reached'); }],
  ['11-fountain', 'debug', async (p, lw) => { if (!(await reach(p, lw, 'fountain'))) throw new Error('no fountain chamber reached'); }],
  ...G.BOSSES.map((b, i) => [`${12 + i}-boss-${b}`, 'debug', async (p, lw) => { await lw('boss', b); await G.waitScene(lw, G.RUN_SCENES, 8000); await lw('god', true); await fight(lw, 3500); }]),
  ['16-paused', 'debug', async (p, lw) => { await lw('play', { seed: 16 }); await G.waitScene(lw, G.RUN_SCENES, 8000); await sleep(800); await p.keyboard.press(G.KEYS.pause); await G.waitScene(lw, 'paused', 3000); await sleep(400); }],
  ['17-dead', 'debug', async (p, lw) => { await lw('play', { seed: 17 }); await G.waitScene(lw, G.RUN_SCENES, 8000); await sleep(600); await lw('kill'); await G.waitScene(lw, ['dead'], 8000); await sleep(1500); }],
  ['18-victory', 'debug', async (p, lw) => { await lw('boss', 'sable'); await G.waitScene(lw, G.RUN_SCENES, 8000); await lw('god', true); await finishBoss(lw); await G.waitScene(lw, ['victory', 'ending'], 20000); await sleep(1200); }],
  ['19-settings', 'debug', async (p, lw) => { await G.clickOr(p, [G.SEL.settings], null); await G.waitScene(lw, 'settings', 3000); await sleep(400); }],
  ['20-codex', 'debug', async (p, lw) => { await G.clickOr(p, ['#btn-codex'], null); await G.waitScene(lw, 'codex', 3000); await sleep(400); }],
  ['21-phone-run', 'debug&touch', async (p, lw) => { await lw('region', 'choir'); await G.waitScene(lw, G.RUN_SCENES, 8000); await lw('god', true); await fight(lw, 2000); }, { width: 844, height: 390, touch: true, mobile: true }],
  ['22-phone-hub', 'debug&touch', async (p, lw) => { await G.titleToHub(p, lw, 0); await sleep(800); }, { width: 844, height: 390, touch: true, mobile: true }],
];

// Live fight for ms: attack the nearest foe so effects are on screen.
async function fight(lw, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await lw('state');
    const e = s.boss && s.boss.x != null ? s.boss : s.enemies[0];
    await lw('input', e ? { move: { x: Math.sign(e.x - s.hero.x) * (Math.hypot(e.x - s.hero.x, e.y - s.hero.y) > 140 ? 1 : 0), y: Math.sign(e.y - s.hero.y) * (Math.hypot(e.x - s.hero.x, e.y - s.hero.y) > 140 ? 1 : 0) }, aim: { x: e.x, y: e.y }, attack: (Date.now() / 150 | 0) % 2 === 0, special: (Date.now() / 1000 | 0) % 3 === 0 } : null);
    await sleep(60);
  }
  await lw('input', null);
}

// Beats the current boss through every phase: bossKill() may end one phase at
// a time, with lines in between.
async function finishBoss(lw) {
  let seen = false; // the boss arrives a moment after the chamber does
  for (let k = 0; k < 16; k++) {
    const s = await lw('state');
    if (s.boss) seen = true;
    if (G.END_SCENES.includes(s.scene) || (seen && !s.boss && s.scene === 'run')) return;
    if (s.scene === 'dialogue') await lw('skip');
    else if (s.scene === 'run' && s.boss) await lw('bossKill');
    await sleep(700);
  }
}

// Plays chambers by doors (clear, take a card, beat a boss, go through the
// first door whose reward matches) until the wanted chamber kind or scene
// shows up. Which chambers a run offers depends on its seed, so a few seeds
// are tried. Then interacts, so the shop or fountain screen opens if the game
// opens it from where the hero stands (else the shot is of the chamber).
async function reach(p, lw, kind) {
  let found = false;
  for (let seed = 77; seed < 83 && !found; seed++) {
    await lw('freeze');
    await lw('play', { seed });
    for (let i = 0; i < 12; i++) {
      let s = (await G.stepUntil(p, 's => s.scene !== "loading" && s.scene !== "dialogue"', { ms: 3000, chunk: 100, skipDialogue: true })).s;
      if (s.scene === kind || s.chamberKind === kind) { found = true; break; }
      if (s.region !== G.REGIONS[0] && i > 0) break; // past the first region: try the next seed
      await lw('clear');
      for (let k = 0; k < 4 && s.boss; k++) { if (s.scene === 'run') await lw('bossKill'); s = (await G.stepUntil(p, 's => !s.boss || (s.scene === "run" && s.boss.hp === s.boss.maxHp)', { ms: 8000, chunk: 100, skipDialogue: true })).s; }
      s = (await G.stepUntil(p, 's => (s.offer && s.offer.length) || (s.cleared && s.doors.some((d) => d.open))', { ms: 8000, skipDialogue: true })).s;
      if (s.offer && s.offer.length) { await lw('choose', 0); s = (await G.stepUntil(p, 's => s.cleared && s.doors.some((d) => d.open)', { ms: 8000, skipDialogue: true })).s; }
      const doors = s.doors.filter((d) => d.open);
      const d = doors.find((x) => String(x.reward).includes(kind)) || doors[0];
      if (!d) break;
      await lw('door', d.i);
      await G.stepUntil(p, `s => s.chamber !== ${s.chamber} || s.region !== ${JSON.stringify(s.region)}`, { ms: 8000, chunk: 100 });
    }
  }
  await lw('thaw');
  const s = await lw('state');
  if (s.chamberKind === kind && s.scene === 'run') { await lw('input', { interact: true }); await sleep(150); await lw('input', null); }
  await G.waitScene(lw, [kind, 'run'], 4000);
  await sleep(900);
  return found;
}

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
        const lw = query.includes('debug') ? await G.hook(page) : null;
        if (!lw) await sleep(1500);
        else await setup(page, lw);
        const file = path.join(OUT, `${name}.png`);
        await page.screenshot({ path: file });
        r.stats = await frameStats(page);
        r.ok = r.stats.std > 8 && r.stats.colours > 40;
        if (!r.ok) r.why = `flat frame ${JSON.stringify(r.stats)}`;
        if (lw) r.scene = (await lw('state')).scene;
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
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Loomwake screens</title><style>body{background:#111;color:#eee;font:14px system-ui;margin:16px}figure{display:inline-block;margin:8px;vertical-align:top}img{width:420px;border:1px solid #333}figcaption{padding:4px 0}.bad{color:#f77}</style>${results.map((r) => `<figure><img src="${r.name}.png" alt="${r.name}"><figcaption class="${r.ok ? '' : 'bad'}">${r.name}${r.ok ? '' : ` — ${r.why || 'failed'}`}</figcaption></figure>`).join('')}`);
  if (process.env.LW_SHOTS_DIR) {
    fs.mkdirSync(process.env.LW_SHOTS_DIR, { recursive: true });
    for (const f of fs.readdirSync(OUT)) fs.copyFileSync(path.join(OUT, f), path.join(process.env.LW_SHOTS_DIR, f));
  }
  const bad = results.filter((r) => !r.ok);
  if (bad.length) { console.log(`\nFAIL: ${bad.map((r) => r.name).join(', ')}`); process.exit(1); }
  console.log(`PASS: ${results.length} screens in ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
