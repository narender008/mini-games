// Screenshot pass: captures each scene at 1280x720 into out/screens/ with an
// index.html contact sheet for visual review: the title, a room of every
// biome, every boss fight, the map, pause, death and the ending, plus the
// phone layout. Fails if a core scene cannot be reached, a frame is blank, or
// the page logs an error.
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const OUT = path.join(__dirname, 'out', 'screens');
const pad = (n) => String(n).padStart(2, '0');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(process.env.EB_ROOT);
  const browser = await launch();

  // read the world once to pick a room per biome (the first non-boss room with the most open space)
  const p0 = await open(browser, server.url, 'debug&seed=7');
  const W = await (await hook(p0))('world');
  await close(p0);
  const biomes = [];
  for (const r of W.rooms) if (!biomes.includes(r.biome)) biomes.push(r.biome);
  const roomFor = (b) => {
    const rs = W.rooms.filter((r) => r.biome === b && !r.boss);
    const open_ = (r) => r.tiles.join('').split('').filter((c) => c === '.').length / (r.tw * r.th);
    return rs.sort((a, c) => open_(c) - open_(a))[0] || W.rooms.find((r) => r.biome === b);
  };
  const enter = async (eb, id) => { await G.fresh(eb, { room: id, abilities: 'all' }); await eb('goto', id); await eb('god', true); await eb('thaw'); await G.sleep(1200); };

  let n = 1;
  const SHOTS = [
    { name: `${pad(n++)}-title`, core: true, scene: 'title', go: async (eb) => { await eb('resetSave'); await eb('menu'); } },
    ...biomes.map((b) => ({ name: `${pad(n++)}-${b}`, core: true, scene: 'play', go: async (eb) => enter(eb, roomFor(b).id) })),
    ...G.BOSSES.map((id) => ({ name: `${pad(n++)}-boss-${id}`, core: true, scene: 'play', boss: true, go: async (eb) => {
      await G.fresh(eb, { abilities: 'all' });
      await eb('boss', id); await eb('god', true); await eb('thaw'); await G.sleep(2500);
    } })),
    { name: `${pad(n++)}-map`, core: true, scene: 'map', go: async (eb) => { await enter(eb, roomFor(biomes[1] || biomes[0]).id); await eb('map'); await G.sleep(500); } },
    { name: `${pad(n++)}-paused`, scene: 'paused', go: async (eb) => { await enter(eb, roomFor(biomes[0]).id); await eb('pause', true); await G.sleep(400); } },
    { name: `${pad(n++)}-dead`, scene: 'dead', go: async (eb) => { await enter(eb, roomFor(biomes[0]).id); await eb('god', false); const s = await eb('state'); await eb('damage', s.player.maxHp ?? 99); await G.sleep(700); } },
    { name: `${pad(n++)}-won`, core: true, scene: 'won', go: async (eb) => {
      await G.fresh(eb, { abilities: 'all' });
      await eb('boss', G.FINAL_BOSS); await eb('thaw'); await G.sleep(300); await eb('kill');
      await G.waitScene(eb, 'won', 10000); await G.sleep(1500);
    } },
  ];

  const results = [];
  for (const shot of SHOTS) {
    const page = await open(browser, server.url, 'debug&seed=7');
    const r = { name: shot.name, core: !!shot.core };
    try {
      const eb = await hook(page);
      await shot.go(eb, page);
      await G.sleep(300);
      const s = await eb('state');
      r.scene = s.scene; r.room = s.room;
      if (shot.scene && s.scene !== shot.scene) throw new Error(`landed on scene '${s.scene}', wanted '${shot.scene}'`);
      if (shot.boss && !s.boss) throw new Error('no boss fight on');
      await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
      r.stats = await frameStats(page);
      if (r.stats.std < 8 || r.stats.colours < 40) throw new Error(`frame looks blank: ${JSON.stringify(r.stats)}`);
      if (page.problems.length) throw new Error(page.problems[0]);
      r.ok = true;
    } catch (e) { r.ok = false; r.error = e.message.split('\n')[0]; }
    results.push(r);
    console.log(`${r.ok ? 'ok  ' : (r.core ? 'FAIL' : 'warn')} ${shot.name}${r.room ? ` (${r.room})` : ''}${r.error ? `: ${r.error}` : ''}`);
    await close(page);
  }

  for (const [name, w, h] of [[`${pad(n++)}-phone-landscape`, 844, 390], [`${pad(n++)}-phone-portrait`, 390, 844]]) {
    const page = await open(browser, server.url, 'debug&seed=7', { width: w, height: h, touch: true, mobile: true });
    const r = { name, core: false };
    try {
      const eb = await hook(page);
      await enter(eb, roomFor(biomes[0]).id);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      r.stats = await frameStats(page);
      r.ok = r.stats.std > 8;
      if (!r.ok) r.error = 'blank frame';
    } catch (e) { r.ok = false; r.error = e.message.split('\n')[0]; }
    results.push(r);
    console.log(`${r.ok ? 'ok  ' : 'warn'} ${name}${r.error ? `: ${r.error}` : ''}`);
    await close(page);
  }
  await browser.close();
  await server.close();
  const html = `<!doctype html><meta charset="utf-8"><title>Emberfall screens</title><style>body{background:#111;color:#ddd;font:14px system-ui;margin:16px}figure{display:inline-block;margin:8px;vertical-align:top}img{width:640px;max-width:90vw;display:block;border:1px solid #333}figcaption{padding:4px 0}.bad{color:#f77}</style>${results.map((r) => `<figure><img src="${r.name}.png" alt="${r.name}"><figcaption class="${r.ok ? '' : 'bad'}">${r.name}${r.room ? ` (${r.room})` : ''}${r.error ? ` – ${r.error}` : ''}</figcaption></figure>`).join('')}`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.ok && r.core);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} scenes captured to ${OUT}`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
