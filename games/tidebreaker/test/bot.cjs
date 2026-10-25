// Bot playtest: drives full runs through the debug hook with several upgrade
// builds and seeds, then checks that the game is winnable and that a winning
// run lasts roughly 10 to 15 minutes of sim time. Writes out/balance.json and
// out/balance.md.
//
//   TB_SEEDS=4          runs per build
//   TB_MIN=8 TB_MAX=17  pass band for the median winning run, in minutes
//   TB_BUILDS=a,b       only these builds
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');
const { botInit, botRun } = require('./lib/policy.cjs');

const OUT = path.join(__dirname, 'out');
const SEEDS = +(process.env.TB_SEEDS || 3);
const MIN = +(process.env.TB_MIN || 8), MAX = +(process.env.TB_MAX || 17);
const CONC = +(process.env.TB_CONC || 3);

// Builds pick by id patterns first; the generic rules make sure every card
// path gets played even if ids change.
const BUILDS = [
  { name: 'firepower', rule: 'prefer', prefer: ['chain', 'shot', 'cannon', 'broadside', 'powder', 'reload'] },
  { name: 'storm', rule: 'prefer', prefer: ['lightning', 'mast', 'storm', 'thunder'] },
  { name: 'fire', rule: 'prefer', prefer: ['fire', 'barrel', 'burn', 'flame'] },
  { name: 'ally', rule: 'prefer', prefer: ['kraken', 'ally', 'gull', 'crew', 'drone'] },
  { name: 'tank', rule: 'prefer', prefer: ['hull', 'armou?r', 'repair', 'plank', 'shield', 'heal'] },
  { name: 'first-card', rule: 'first' },
  { name: 'random', rule: 'random' },
].filter((b) => !process.env.TB_BUILDS || process.env.TB_BUILDS.split(',').includes(b.name));

const SKILLS = { sharp: { aimNoise: 8, reactionMs: 250, dodge: true }, casual: { aimNoise: 40, reactionMs: 600, dodge: false } };

async function runOne(browser, url, build, seed, skill) {
  const page = await open(browser, url, `debug&seed=${seed}`);
  try {
    const tb = await hook(page);
    const has = await page.evaluate(() => Object.keys(window.__tb));
    if (has.includes('seed')) await tb('seed', seed);
    if (has.includes('play')) { await tb('play', { seed }); await G.waitScene(page, tb, G.PLAY_SCENES, 6000); }
    else await G.startFromTitle(page, tb);
    await page.evaluate(botInit, { seed, build, tickMs: 100, lead: 4, maxSec: 30 * 60, ...SKILLS[skill] });
    let r;
    const wall = Date.now();
    do {
      r = await page.evaluate(botRun, 60);
      if (Date.now() - wall > 8 * 60 * 1000) { r.log.end = r.log.end || 'wall-timeout'; break; }
    } while (!r.done);
    if (page.problems.length) r.log.problems = page.problems.slice(0, 10);
    return { build: build.name, seed, skill, result: r.log.end, minutes: r.s.time / 60, bossAtMin: r.log.bossAt == null ? null : r.log.bossAt / 60, waveReached: r.s.stage ?? r.s.wave, leg: r.s.leg, bosses: r.log.bosses, hpLow: r.log.hpLow === Infinity ? null : r.log.hpLow, hpEnd: r.s.maxHp ? r.s.hp / r.s.maxHp : null, score: r.s.score, shots: r.s.shots, hits: r.s.hits, upgrades: r.s.upgrades, picks: r.log.picks.map((p) => p.id), waves: r.log.waves, problems: r.log.problems || [], wallSec: (Date.now() - wall) / 1000 };
  } finally { await close(page); }
}

const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : (+v).toFixed(d));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(process.env.TB_ROOT);
  const browser = await launch();
  const jobs = [];
  for (const b of BUILDS) for (let i = 0; i < SEEDS; i++) jobs.push([b, 1000 + i * 17, 'sharp']);
  for (let i = 0; i < SEEDS; i++) jobs.push([BUILDS[0], 5000 + i * 31, 'casual']);
  const runs = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < jobs.length) {
      const [b, seed, skill] = jobs[next++];
      try {
        const r = await runOne(browser, server.url, b, seed, skill);
        runs.push(r);
        console.log(`${r.result.padEnd(8)} ${b.name.padEnd(11)} ${skill.padEnd(6)} seed ${seed}: ${f(r.minutes)} min, boss at ${f(r.bossAtMin)} min, wave ${r.waveReached}, low hp ${f(r.hpLow * 100, 0)}%`);
      } catch (e) {
        runs.push({ build: b.name, seed, skill, result: 'error', error: e.message.split('\n')[0] });
        console.log(`error    ${b.name} seed ${seed}: ${e.message.split('\n')[0]}`);
      }
    }
  }));
  await browser.close();
  await server.close();

  const failures = [];
  const rows = [];
  for (const b of BUILDS) {
    const rs = runs.filter((r) => r.build === b.name && r.skill === 'sharp');
    const wins = rs.filter((r) => r.result === 'won');
    const row = { build: b.name, runs: rs.length, wins: wins.length, medianWinMin: median(wins.map((r) => r.minutes)), medianBossMin: median(rs.map((r) => r.bossAtMin).filter((v) => v != null)), medianLowHp: median(rs.map((r) => r.hpLow).filter((v) => v != null)), losses: rs.filter((r) => r.result === 'lost').map((r) => r.waveReached), picks: [...new Set(rs.flatMap((r) => r.picks || []))] };
    rows.push(row);
    if (!wins.length) failures.push(`build '${b.name}' never won (${rs.map((r) => r.result).join(', ')})`);
  }
  const sharp = runs.filter((r) => r.skill === 'sharp');
  const wins = sharp.filter((r) => r.result === 'won');
  const winMed = median(wins.map((r) => r.minutes));
  if (winMed != null && (winMed < MIN || winMed > MAX)) failures.push(`median winning run is ${f(winMed)} min, outside ${MIN}-${MAX}`);
  if (wins.length < sharp.length / 2) failures.push(`only ${wins.length} of ${sharp.length} sharp-bot runs won`);
  for (const r of runs) {
    if (r.result === 'error' || r.result === 'timeout' || r.result === 'wall-timeout') failures.push(`${r.build} seed ${r.seed}: ${r.result}${r.error ? ` (${r.error})` : ''}`);
    if (r.problems?.length) failures.push(`${r.build} seed ${r.seed}: page problems: ${r.problems[0]}`);
  }
  const casual = runs.filter((r) => r.skill === 'casual');

  const md = [
    '# Tidebreaker bot playtest', '',
    `Sharp bot (aim noise ${SKILLS.sharp.aimNoise} px, ${SKILLS.sharp.reactionMs} ms reaction), ${SEEDS} seeds per build. Pass band for the median winning run: ${MIN}-${MAX} min (target 10-15).`, '',
    `Overall: ${wins.length}/${sharp.length} wins, median winning run ${f(winMed)} min.`,
    `Casual bot (aim noise ${SKILLS.casual.aimNoise} px, ${SKILLS.casual.reactionMs} ms): ${casual.filter((r) => r.result === 'won').length}/${casual.length} wins, median ${f(median(casual.map((r) => r.minutes)))} min.`, '',
    '| Build | Wins | Median win (min) | First boss (min) | Lowest hp | Lost on stage | Cards taken |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.build} | ${r.wins}/${r.runs} | ${f(r.medianWinMin)} | ${f(r.medianBossMin)} | ${f(r.medianLowHp == null ? null : r.medianLowHp * 100, 0)}% | ${r.losses.join(', ') || '–'} | ${r.picks.join(', ') || '–'} |`),
    '', failures.length ? `## Failures\n\n${failures.map((x) => `- ${x}`).join('\n')}` : 'All balance checks passed.', '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'balance.json'), JSON.stringify({ runs, rows, failures }, null, 2));
  fs.writeFileSync(path.join(OUT, 'balance.md'), md);
  console.log(`\n${md}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
