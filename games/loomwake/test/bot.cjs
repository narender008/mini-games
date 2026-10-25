// Bot playtest. Two parts:
//
// 1. Critical path: one run in god mode from the hub through all four regions,
//    every chamber played with real inputs and real doors, each boss fought
//    and beaten, to the victory and ending screens. Proves the whole game can
//    be finished.
// 2. Balance: several "campaigns", each a fresh profile playing up to LW_RUNS
//    runs in a row (meta progress carries over between runs, as for a
//    player), with different boon builds and skill presets. Reports win rate,
//    run length, time per region, damage taken per chamber, where runs die
//    and what was picked. Fails if a campaign never clears the first region,
//    if no campaign ever wins, or if the median region time is far outside
//    the plan's 6 to 12 minutes.
//
// Writes out/balance.md and out/balance.json. Exits non-zero on failure.
//
//   LW_CAMPAIGNS=6   campaigns (builds x skills are cycled)
//   LW_RUNS=6        runs per campaign
//   LW_CONC=3        pages at once
//   LW_MIN_WINS=1    fair wins needed across all campaigns
//   LW_REGION_MIN=4 LW_REGION_MAX=15   pass band for the median region time, minutes
//   LW_WALL_MIN=25   real minutes per campaign before it is cut off
//   LW_SKIP_PATH=1   skip part 1; LW_SKIP_BALANCE=1 skip part 2
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');
const { botInit, botRun } = require('./lib/policy.cjs');

const OUT = path.join(__dirname, 'out');
const env = (k, d) => (process.env[k] != null ? +process.env[k] : d);
const CAMPAIGNS = env('LW_CAMPAIGNS', 6), RUNS = env('LW_RUNS', 6), CONC = env('LW_CONC', 3);
const MIN_WINS = env('LW_MIN_WINS', 1), RMIN = env('LW_REGION_MIN', 4), RMAX = env('LW_REGION_MAX', 15);
const WALL_MIN = env('LW_WALL_MIN', 25);

// Builds take the first offered boon matching their list (boon id, patron or
// slot, as regexes), braids always first; the generic rules cover the rest.
const BUILDS = [
  { name: 'storm-tide', rule: 'prefer', prefer: ['veyra', 'maru', '.*storm.*', '.*tide.*'] },
  { name: 'dawn-stone', rule: 'prefer', prefer: ['solenne', 'ossian', '.*dawn.*', '.*stone.*'] },
  { name: 'shade-wind', rule: 'prefer', prefer: ['ilu', 'kestrel', '.*shade.*', '.*wind.*'] },
  { name: 'attack-first', rule: 'prefer', prefer: ['attack', 'special', 'passive'] },
  { name: 'rarest', rule: 'rarest' },
  { name: 'random', rule: 'random' },
];
const SKILLS = {
  sharp: { aimNoise: 6, reactionMs: 200, dodge: true, dodgeLead: 0.3, dashLead: 0.14, dodgePad: 14 },
  casual: { aimNoise: 30, reactionMs: 450, dodge: true, dodgeLead: 0.18, dashLead: 0.08, dodgePad: 4 },
};
const WEAPONS = ['blade', 'spear', 'bow', 'gauntlets', 'chakram'];
const BASE = { tickMs: 1000 / 60, reach: 95, lingerSec: 1.2, maxSec: 75 * 60 };

const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : (+v).toFixed(d));

async function playRun(page, lw, cfg, wallEnd) {
  await page.evaluate(botInit, cfg);
  let r;
  do {
    r = await page.evaluate(botRun, 90);
    if (Date.now() > wallEnd) { r.log.end = r.log.end || 'wall-timeout'; break; }
  } while (!r.done);
  return r;
}

// Back to the hub after a run, with dialogue skipped, so the next run starts
// the way a player's would.
async function toHub(page, lw) {
  const r = await G.stepUntil(page, `s => { if (s.scene === 'dialogue') window.__lw.skip(); if (s.scene === 'dead' || s.scene === 'victory' || s.scene === 'ending') { const b = document.querySelector('#btn-return'); if (b) b.click(); } return s.scene === 'hub'; }`, { ms: 60000, chunk: 200 });
  if (!r.ok) { await lw('hub'); }
  return lw('state');
}

async function critical(browser, url) {
  const page = await open(browser, url, 'debug&quality=low');
  const out = { ok: false, regions: [], bosses: [], problems: [] };
  try {
    const lw = await G.hook(page);
    await lw('freeze');
    await lw('god', true);
    await lw('play', { seed: 31337, weapon: 'blade' });
    await G.waitSceneStepped(page, lw, G.RUN_SCENES);
    await lw('god', true);
    const r = await playRun(page, lw, { ...BASE, ...SKILLS.sharp, seed: 31337, build: BUILDS[0] }, Date.now() + WALL_MIN * 60000);
    const s = await lw('state');
    out.end = r.log.end;
    out.minutes = r.s.runTime / 60;
    out.regions = Object.entries(r.log.regions).map(([id, x]) => ({ id, minutes: ((x.end ?? r.s.runTime) - x.start) / 60 }));
    out.bosses = r.log.bosses.map((b) => ({ id: b.id, secs: b.secs, won: b.won }));
    out.chambers = r.log.chambers.length;
    out.story = s.story;
    const beaten = new Set(out.bosses.filter((b) => b.won || b.id === G.FINAL_BOSS).map((b) => b.id));
    out.missing = G.BOSSES.filter((b) => !beaten.has(b));
    out.ok = r.log.end === 'won' && out.missing.length === 0 && G.REGIONS.every((g) => r.log.regions[g]);
    // past the victory screen: the ending and a first-clear flag
    await lw('thaw');
    const after = await toHub(page, lw);
    out.storyAfter = after.story;
    if (!after.story || !(after.story.wins >= 1)) { out.ok = false; out.why = 'story.wins not counted after the victory'; }
  } catch (e) { out.why = e.message; }
  out.problems = page.problems.slice(0, 10);
  if (out.problems.length) out.ok = false;
  await close(page);
  return out;
}

async function campaign(browser, url, i) {
  const build = BUILDS[i % BUILDS.length];
  const skill = i % 3 === 2 ? 'casual' : 'sharp';
  const weapon = WEAPONS[0];
  const page = await open(browser, url, 'debug&quality=low');
  const res = { i, build: build.name, skill, weapon, runs: [], problems: [] };
  const wallEnd = Date.now() + WALL_MIN * 60000;
  try {
    const lw = await G.hook(page);
    await lw('freeze');
    for (let k = 0; k < RUNS && Date.now() < wallEnd; k++) {
      const seed = 1000 * (i + 1) + k;
      await lw('play', { seed, weapon });
      await G.waitSceneStepped(page, lw, G.RUN_SCENES);
      const r = await playRun(page, lw, { ...BASE, ...SKILLS[skill], seed, build }, wallEnd);
      const L = r.log;
      res.runs.push({
        k, seed, end: L.end, minutes: r.s.runTime / 60, reached: r.s.region, chamber: r.s.chamber,
        regions: Object.fromEntries(Object.entries(L.regions).map(([id, x]) => [id, { minutes: ((x.end ?? r.s.runTime) - x.start) / 60, done: x.end != null || L.end === 'won' }])),
        bosses: L.bosses.map((b) => ({ id: b.id, secs: b.secs == null ? null : +b.secs.toFixed(1), won: !!b.won, minHp: b.minHp })),
        hurtPerChamber: L.chambers.length ? L.hurt / L.chambers.length : null, chambers: L.chambers.length,
        dodges: L.dodges, dashes: L.dashes, hpLow: L.hpLow, picks: L.picks.map((p) => p.id), braids: L.braids, deaths: L.deaths,
        boons: (r.s.boons || []).map((b) => `${b.id}:${b.rarity}`), lumen: r.s.currency && r.s.currency.lumen,
      });
      console.log(`  campaign ${i} (${build.name}/${skill}) run ${k}: ${L.end} in ${f(r.s.runTime / 60)} min, reached ${r.s.region} ${r.s.chamber}`);
      if (L.end === 'wall-timeout' || L.end === 'timeout') break;
      await lw('thaw');
      await toHub(page, lw);
      await lw('freeze');
    }
    res.story = (await lw('state')).story;
  } catch (e) { res.error = e.message; }
  res.problems = page.problems.slice(0, 10);
  await close(page);
  return res;
}

async function pool(n, items, fn) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await launch();
  const failures = [];
  const report = { when: new Date().toISOString() };
  try {
    if (!process.env.LW_SKIP_PATH) {
      console.log('critical path (god mode, real doors, all four regions)...');
      const c = await critical(browser, server.url);
      report.critical = c;
      console.log(`  ${c.ok ? 'OK' : 'FAIL'}: ${c.end} in ${f(c.minutes)} min, regions ${c.regions.map((r) => `${r.id} ${f(r.minutes)}m`).join(', ')}, bosses ${c.bosses.map((b) => b.id).join(', ')}`);
      if (!c.ok) failures.push(`critical path did not reach the ending: ${c.why || c.end}; missing bosses ${(c.missing || []).join(', ')}; ${c.problems.join(' | ')}`);
    }
    if (!process.env.LW_SKIP_BALANCE) {
      console.log(`balance: ${CAMPAIGNS} campaigns x up to ${RUNS} runs, ${CONC} at once...`);
      const camps = await pool(CONC, Array.from({ length: CAMPAIGNS }, (_, i) => i), (i) => campaign(browser, server.url, i));
      report.campaigns = camps;
      const runs = camps.flatMap((c) => c.runs.map((r) => ({ ...r, build: c.build, skill: c.skill })));
      const wins = runs.filter((r) => r.end === 'won');
      const regionTimes = {};
      for (const r of runs) for (const [id, x] of Object.entries(r.regions)) if (x.done) (regionTimes[id] = regionTimes[id] || []).push(x.minutes);
      const reach = Object.fromEntries(G.REGIONS.map((g) => [g, runs.filter((r) => r.regions[g]).length]));
      const deaths = {};
      for (const r of runs) for (const d of r.deaths || []) { const k2 = d.boss ? `boss ${d.boss}` : `${d.region} ${d.kind || ''}`.trim(); deaths[k2] = (deaths[k2] || 0) + 1; }
      const allRegion = Object.values(regionTimes).flat();
      report.summary = {
        runs: runs.length, wins: wins.length, winRate: runs.length ? wins.length / runs.length : 0,
        medianRunMin: median(runs.map((r) => r.minutes)), medianWinMin: median(wins.map((r) => r.minutes)),
        medianRegionMin: median(allRegion), regionMedians: Object.fromEntries(Object.entries(regionTimes).map(([k2, v]) => [k2, median(v)])),
        reach, deaths, hurtPerChamber: median(runs.map((r) => r.hurtPerChamber).filter((x) => x != null)),
        firstWinRun: Object.fromEntries(camps.map((c) => [c.i, (c.runs.find((r) => r.end === 'won') || {}).k ?? null])),
      };
      const S = report.summary;
      console.log(`  ${S.wins}/${S.runs} wins, median run ${f(S.medianRunMin)} min, median region ${f(S.medianRegionMin)} min`);
      for (const c of camps) {
        if (c.error) failures.push(`campaign ${c.i} crashed: ${c.error}`);
        if (c.problems.length) failures.push(`campaign ${c.i} page problems: ${c.problems.join(' | ')}`);
        if (!c.runs.some((r) => r.regions[G.REGIONS[0]] && r.regions[G.REGIONS[0]].done)) failures.push(`campaign ${c.i} (${c.build}/${c.skill}) never cleared ${G.REGIONS[0]} in ${c.runs.length} runs`);
        if (c.runs.some((r) => r.end === 'timeout' || r.end === 'wall-timeout' || /^left-run/.test(r.end))) failures.push(`campaign ${c.i} had a run that stalled (${c.runs.map((r) => r.end).join(', ')})`);
      }
      if (wins.length < MIN_WINS) failures.push(`only ${wins.length} fair wins in ${runs.length} runs (need ${MIN_WINS})`);
      if (S.medianRegionMin != null && (S.medianRegionMin < RMIN || S.medianRegionMin > RMAX)) failures.push(`median region time ${f(S.medianRegionMin)} min is outside ${RMIN}-${RMAX}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  report.failures = failures;
  fs.writeFileSync(path.join(OUT, 'balance.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'balance.md'), markdown(report));
  console.log(`report: ${path.join(OUT, 'balance.md')}`);
  if (failures.length) { console.log(`\nFAIL\n- ${failures.join('\n- ')}`); process.exit(1); }
  console.log('PASS');
}

function markdown(R) {
  const L = [`# Loomwake bot playtest`, '', `${R.when}`, ''];
  if (R.critical) {
    const c = R.critical;
    L.push('## Critical path (god mode)', '', `${c.ok ? 'Reached the ending' : 'FAILED'}: ${c.end || c.why} in ${f(c.minutes)} sim minutes over ${c.chambers ?? '–'} chambers.`, '');
    L.push('| Region | Minutes |', '|---|---|', ...c.regions.map((r) => `| ${r.id} | ${f(r.minutes)} |`), '');
    L.push('| Boss | Seconds | Beaten |', '|---|---|---|', ...c.bosses.map((b) => `| ${b.id} | ${f(b.secs)} | ${b.won ? 'yes' : 'no'} |`), '');
  }
  if (R.summary) {
    const S = R.summary;
    L.push('## Balance', '', `- Runs: ${S.runs}, wins: ${S.wins} (${f(S.winRate * 100, 0)}%)`, `- Median run: ${f(S.medianRunMin)} min; median winning run: ${f(S.medianWinMin)} min`,
      `- Median region time: ${f(S.medianRegionMin)} min (plan target 6 to 12) — ${Object.entries(S.regionMedians).map(([k, v]) => `${k} ${f(v)}`).join(', ')}`,
      `- Runs reaching each region: ${Object.entries(S.reach).map(([k, v]) => `${k} ${v}`).join(', ')}`,
      `- Median damage taken per chamber: ${f(S.hurtPerChamber)}`,
      `- Where runs ended: ${Object.entries(S.deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}`,
      `- First win per campaign (run index): ${Object.entries(S.firstWinRun).map(([k, v]) => `#${k} ${v ?? 'never'}`).join(', ')}`, '');
    L.push('| Campaign | Build | Skill | Run | Result | Minutes | Reached | Hurt/chamber | Braids |', '|---|---|---|---|---|---|---|---|---|');
    for (const c of R.campaigns) for (const r of c.runs) L.push(`| ${c.i} | ${c.build} | ${c.skill} | ${r.k} | ${r.end} | ${f(r.minutes)} | ${r.reached} ${r.chamber} | ${f(r.hurtPerChamber)} | ${(r.braids || []).join(' ')} |`);
    L.push('');
  }
  if (R.failures.length) L.push('## Failures', '', ...R.failures.map((x) => `- ${x}`), '');
  return L.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
