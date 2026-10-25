// The economy bot: fresh colonies on several seeds played forward through
// the action API only (lib/policy.cjs), with a pirate raid and a storm forced
// on a schedule. Each colony must run its production chains, research towards
// the goal, come through the raid and the storm, send an expedition and claim
// a second island, and reach the long-term goal inside the time budget.
// Writes out/economy.md and out/economy.json. Optionally runs the game's own
// autopilot (__sf.auto) beside it for comparison (report only).
//
// SF_SEEDS (comma list, default 101,202,303), SF_MIN_WINS (default: every
// seed), SF_GOAL_MIN / SF_GOAL_MAX (sim minutes, default 20 / 240),
// SF_RAID_AT / SF_STORM_AT (sim minutes, default 25 / 40), SF_TICK (sim
// seconds between decisions, default 5), SF_SKIP_AUTO=1 skips the autopilot.
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const B = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');
const { tick } = require('./lib/policy.cjs');

const num = (k, d) => (process.env[k] != null && process.env[k] !== '' ? Number(process.env[k]) : d);
const SEEDS = (process.env.SF_SEEDS || '101,202,303').split(',').map(Number);
const MIN_WINS = num('SF_MIN_WINS', SEEDS.length);
const GOAL_MIN = num('SF_GOAL_MIN', 20), GOAL_MAX = num('SF_GOAL_MAX', 240);
const RAID_AT = num('SF_RAID_AT', 25), STORM_AT = num('SF_STORM_AT', 40);
const TICK = num('SF_TICK', 5);
const OUT = path.join(__dirname, 'out');

async function playColony(browser, base, seed) {
  const page = await B.open(browser, base, 'debug');
  const sf = await G.hook(page);
  await G.freshColony(page, sf, { seed });
  const c = await sf('content');
  const run = { seed, won: false, lost: false, minutes: 0, raid: null, storm: null, samples: [], log: [], problems: [] };
  const limit = GOAL_MAX * 1.25 * 60; // play on a little past the budget so a near miss shows how near
  const t0 = (await sf('state')).time;
  let mem = { log: [] };
  while (true) {
    // ten sim minutes per call keeps each evaluate short
    const r = await page.evaluate(([src, mem, c, tickS, raidAt, stormAt, t0, limit]) => {
      const sf = window.__sf, f = (0, eval)(`(${src})`);
      const samples = [];
      let s = sf.state(), raid = null, storm = null;
      const end = s.time + 600;
      while (s.time < end) {
        const el = (s.time - t0) / 60;
        if (!mem.raided && el >= raidAt) { mem.raided = true; sf.raid(); mem.raidStart = s.time; mem.popBefore = s.colony.pop; mem.bBefore = s.buildings.map((b) => b.id); }
        if (!mem.stormed && el >= stormAt) { mem.stormed = true; sf.storm(); mem.stormStart = s.time; }
        f(sf, mem, c);
        sf.step(tickS * 1000, { render: false });
        s = sf.state();
        if (mem.raided && !mem.raidDone && !(s.threat.raid && s.threat.raid.active) && s.time - mem.raidStart > 30) {
          mem.raidDone = true; raid = { secs: Math.round(s.time - mem.raidStart), popLost: mem.popBefore - s.colony.pop, buildingsLost: (() => { const now = new Set(s.buildings.filter((b) => b.state !== 'ruin' && !b.damaged).map((b) => b.id)); return mem.bBefore.filter((id) => !now.has(id)).length; })(), pop: s.colony.pop };
        }
        if (mem.stormed && !mem.stormDone && !(s.threat.storm && s.threat.storm.active) && s.time - mem.stormStart > 30) {
          mem.stormDone = true; storm = { secs: Math.round(s.time - mem.stormStart), pop: s.colony.pop, damaged: s.buildings.filter((b) => b.damaged).length };
        }
        if (Math.floor(s.time / 60) !== Math.floor((s.time - tickS) / 60)) samples.push({ m: Math.round((s.time - t0) / 60), pop: s.colony.pop, res: s.res, rates: s.rates, buildings: s.buildings.length, research: s.research.done.length, islands: s.islands.filter((i) => i.owned).length, goal: s.goal && s.goal.progress });
        if (s.goal && s.goal.done) break;
        if (s.scene === 'won' || s.scene === 'lost') break;
        if (s.time - t0 > limit) break;
      }
      return { mem, samples, raid, storm, s: JSON.parse(JSON.stringify(s)) };
    }, [tick.toString(), mem, c, TICK, RAID_AT, STORM_AT, t0, limit]);
    mem = r.mem;
    run.samples.push(...r.samples);
    if (r.raid) run.raid = r.raid;
    if (r.storm) run.storm = r.storm;
    const s = r.s;
    run.minutes = (s.time - t0) / 60;
    run.final = { pop: s.colony.pop, buildings: s.buildings.length, research: s.research.done.length, islands: s.islands.filter((i) => i.owned).length, goal: s.goal, scene: s.scene, res: s.res };
    if ((s.goal && s.goal.done) || s.scene === 'won') { run.won = true; break; }
    if (s.scene === 'lost' || s.colony.pop <= 0) { run.lost = true; break; }
    if (s.time - t0 > limit) break;
    process.stdout.write(`  seed ${seed}: ${run.minutes.toFixed(0)} min, pop ${s.colony.pop}, ${s.buildings.length} buildings, ${s.research.done.length} research, goal ${((s.goal && s.goal.progress) || 0).toFixed(2)}\n`);
  }
  run.log = mem.log;
  run.firsts = Object.fromEntries(Object.entries(mem.seen || {}).map(([k, v]) => [k, +((v - t0) / 60).toFixed(1)]));
  // stalls: stretches of 10+ minutes with no new building, research or island
  const marks = run.log.filter((l) => /^(first|research .* done|island|build|claim)/.test(l.what)).map((l) => (l.t - t0) / 60);
  run.stalls = [];
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] >= 10) run.stalls.push([+marks[i - 1].toFixed(1), +marks[i].toFixed(1)]);
  run.problems = page.problems.slice();
  await B.close(page);
  return run;
}

async function playAuto(browser, base, seed) {
  const page = await B.open(browser, base, 'debug');
  const sf = await G.hook(page);
  await G.freshColony(page, sf, { seed });
  const ok = await page.evaluate(() => typeof window.__sf.auto === 'function');
  if (!ok) { await B.close(page); return null; }
  await sf('auto', true);
  const t0 = (await sf('state')).time;
  let s;
  for (let i = 0; i < GOAL_MAX * 1.25 / 10; i++) {
    s = (await G.stepUntil(page, 's => (s.goal && s.goal.done) || s.scene === "won" || s.scene === "lost"', { ms: 600000, chunk: 5000 })).s;
    if (s.goal && s.goal.done || s.scene === 'won' || s.scene === 'lost') break;
  }
  await B.close(page);
  return { seed, won: !!(s.goal && s.goal.done) || s.scene === 'won', minutes: (s.time - t0) / 60, goal: s.goal };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await B.launch();
  const runs = [], autos = [];
  const fails = [];
  try {
    for (const seed of SEEDS) {
      console.log(`colony seed ${seed}`);
      const r = await playColony(browser, server.url, seed);
      runs.push(r);
      console.log(`  -> ${r.won ? 'goal reached' : r.lost ? 'LOST' : 'goal not reached'} at ${r.minutes.toFixed(1)} min`);
    }
    if (!process.env.SF_SKIP_AUTO) for (const seed of SEEDS.slice(0, 1)) { const a = await playAuto(browser, server.url, seed); if (a) autos.push(a); }
  } finally {
    await browser.close();
    await server.close();
  }
  const wins = runs.filter((r) => r.won);
  if (wins.length < MIN_WINS) fails.push(`only ${wins.length}/${runs.length} colonies reached the goal (need ${MIN_WINS})`);
  for (const r of runs) {
    const tag = `seed ${r.seed}`;
    if (r.lost) fails.push(`${tag}: colony was lost at ${r.minutes.toFixed(1)} min`);
    if (r.won && (r.minutes < GOAL_MIN || r.minutes > GOAL_MAX)) fails.push(`${tag}: goal at ${r.minutes.toFixed(1)} min, outside ${GOAL_MIN}-${GOAL_MAX}`);
    if (!r.raid) fails.push(`${tag}: the forced raid never finished`);
    else if (r.raid.pop <= 0) fails.push(`${tag}: the raid wiped out the colony`);
    if (!r.storm) fails.push(`${tag}: the forced storm never finished`);
    if (!r.log.some((l) => /^expedition/.test(l.what))) fails.push(`${tag}: never sent an expedition`);
    if ((r.final && r.final.islands) < 2) fails.push(`${tag}: never claimed a second island`);
    if (r.problems.length) fails.push(`${tag}: page problems: ${r.problems.slice(0, 3).join(' | ')}`);
  }
  const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
  const md = [
    '# Skyforge Tycoon economy bot',
    '',
    `${wins.length}/${runs.length} colonies reached the goal; median ${median(wins.map((r) => r.minutes))?.toFixed(1) ?? '-'} sim minutes (budget ${GOAL_MIN}-${GOAL_MAX}). Raid forced at ${RAID_AT} min, storm at ${STORM_AT} min. Decisions every ${TICK} s, action API only.`,
    '',
    '| seed | result | minutes | pop | buildings | research | islands | raid (pop lost / buildings lost) | storm (damaged) | stalls |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...runs.map((r) => `| ${r.seed} | ${r.won ? 'goal' : r.lost ? 'lost' : 'no goal'} | ${r.minutes.toFixed(1)} | ${r.final?.pop} | ${r.final?.buildings} | ${r.final?.research} | ${r.final?.islands} | ${r.raid ? `${r.raid.popLost} / ${r.raid.buildingsLost}` : '-'} | ${r.storm ? r.storm.damaged : '-'} | ${r.stalls.map((x) => x.join('-')).join(', ') || '-'} |`),
    '',
    autos.length ? `Built-in autopilot: ${autos.map((a) => `seed ${a.seed} ${a.won ? `goal at ${a.minutes.toFixed(1)} min` : `no goal in ${a.minutes.toFixed(0)} min`}`).join('; ')}` : 'Built-in autopilot: not run or not present.',
    '',
    '## Milestones (sim minutes, first seed)',
    '',
    ...Object.entries(runs[0]?.firsts || {}).sort((a, b) => a[1] - b[1]).map(([k, v]) => `- ${v} ${k.replace(/^b:/, 'first ').replace(/^r:/, 'research ').replace(/^i:/, 'island ').replace(/^g:/, 'goal ')}`),
    '',
    fails.length ? `## FAILURES\n\n${fails.map((f) => `- ${f}`).join('\n')}` : '## All economy checks passed',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'economy.md'), md);
  fs.writeFileSync(path.join(OUT, 'economy.json'), JSON.stringify({ runs, autos, fails }, null, 1));
  console.log(md);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
