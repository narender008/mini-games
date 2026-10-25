// Balance bot for Ace Pilot: the built-in autopilot flies every sector over
// several seeds on a laptop field and a phone-portrait field, at fixed 1/120 s
// steps, and prints a table: win rate, hull hits and shield hits taken, time
// per sector and on the boss, score/rank, and fairness checks (the narrowest
// free gap the player had in its own row, how often the row was fully
// blocked, the most bullets on screen, whether a bullet ever spawned on top
// of the player). Runs in parallel worker threads.
//
//   node games/rocket-blast/test/sim/bot.mjs [--seeds 6] [--sectors 1-5]
//        [--fields laptop,phone] [--waves] [--json]
//
// --waves adds a per-wave breakdown (duration, hits, peak bullets).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createAce, stepAce, autopilot, autopilotPick, chooseUpgrade } from '../../src/ace/sim/index.js';
import { zone } from '../../src/ace/sim/player.js';
import { SAFE_SPAWN } from '../../src/ace/sim/patterns.js';

export const FIELDS = {
  laptop: { halfW: 15.84, halfH: 9.9 },
  phone: { halfW: 6.7, halfH: 14.5 },
};

// the widest free stretch of the player's row (bullets, beams, bodies)
function rowGap(S) {
  const P = S.player;
  const Z = zone(S);
  const iv = [];
  const band = 0.45;
  for (const b of S.bullets) {
    if (b.kind === 'beam') {
      const y0 = Math.min(b.y, b.y1);
      const y1 = Math.max(b.y, b.y1);
      if (P.y < y0 - b.r || P.y > y1 + b.r) continue;
      const k = Math.abs(b.y1 - b.y) > 1e-3 ? (P.y - b.y) / (b.y1 - b.y) : 0;
      const x = b.x + (b.x1 - b.x) * Math.max(0, Math.min(1, k));
      const slope = Math.abs(b.y1 - b.y) > 1e-3 ? Math.abs((b.x1 - b.x) / (b.y1 - b.y)) : 50;
      const w = b.r + P.r + Math.min(20, slope * band);
      iv.push([x - w, x + w]);
    } else if (Math.abs(b.y - P.y) < band + b.r) iv.push([b.x - b.r - P.r, b.x + b.r + P.r]);
  }
  for (const e of S.enemies) if (Math.abs(e.y - P.y) < band + e.r) iv.push([e.x - e.r * 0.8 - P.r, e.x + e.r * 0.8 + P.r]);
  if (S.boss) for (const p of S.boss.parts) if (p.hurt && !p.dead && Math.abs(p.y - P.y) < band + p.r) iv.push([p.x - p.r - P.r, p.x + p.r + P.r]);
  iv.sort((a, b) => a[0] - b[0]);
  let x = Z.x0;
  let best = 0;
  for (const [a, b] of iv) {
    if (a > x) best = Math.max(best, a - x);
    x = Math.max(x, b);
  }
  best = Math.max(best, Z.x1 - x);
  return best;
}

export function runSector(sector, seed, fieldName, opts = {}) {
  const field = FIELDS[fieldName] || fieldName;
  const S = createAce({ seed, sector, field });
  const r = { sector, seed, field: fieldName, win: false, hits: 0, shieldHits: 0, time: 0, bossTime: 0, score: 0, rank: '-', minGap: Infinity, blocked: 0, samples: 0, maxBullets: 0, unsafe: 0, emps: 0, deathWave: 0, waves: [], ms: 0 };
  const t0 = Date.now();
  let sample = 0;
  let wave = null;
  const seen = new WeakSet();
  while (S.phase !== 'dead' && S.phase !== 'cleared' && S.time < 1200) {
    if (S.phase === 'upgrade') chooseUpgrade(S, autopilotPick(S));
    stepAce(S, autopilot(S), 1 / 120);
    const P = S.player;
    // bullets born on top of the player
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      if (b.t > 1 / 120 + 1e-6) break;
      if (seen.has(b) || b.kind === 'beam') continue;
      seen.add(b);
      if (Math.hypot(b.x - b.vx / 120 - P.x, b.y - b.vy / 120 - P.y) < SAFE_SPAWN - 0.3) r.unsafe++;
    }
    for (const e of S.events) {
      if (e.type === 'waveStart') wave = { wave: e.wave, t0: S.time, hits: 0, peak: 0, fire: 0 };
      else if (e.type === 'bossStart') wave = { wave: 'boss', t0: S.time, hits: 0, peak: 0, fire: 0 };
      else if ((e.type === 'waveClear' || e.type === 'bossDead') && wave) {
        wave.dur = S.time - wave.t0;
        r.waves.push(wave);
        wave = null;
      } else if ((e.type === 'playerHit' || e.type === 'shieldHit') && wave) wave.hits++;
      else if (e.type === 'enemyFire' && wave) wave.fire++;
    }
    S.events.length = 0;
    if (wave) wave.peak = Math.max(wave.peak, S.bullets.length);
    r.maxBullets = Math.max(r.maxBullets, S.bullets.length);
    if ((S.phase === 'wave' || S.phase === 'boss') && !P.dead && S.time >= sample) {
      sample = S.time + 0.1;
      const g = rowGap(S);
      r.samples++;
      if (g < r.minGap) r.minGap = g;
      if (g < 0.6) r.blocked++;
    }
  }
  if (wave) {
    wave.dur = S.time - wave.t0;
    wave.died = true;
    r.waves.push(wave);
  }
  r.win = S.phase === 'cleared';
  r.hits = S.stats.hits;
  r.shieldHits = S.stats.shieldHits;
  r.time = S.stats.time;
  r.bossTime = S.boss ? S.boss.t : 0;
  r.bossReached = !!S.boss;
  r.score = S.score;
  r.rank = r.win ? S.rank : '-';
  r.emps = S.stats.emps;
  r.deathWave = r.win ? 0 : S.boss ? 'boss' : S.wave;
  r.upgrades = S.upgrades;
  r.ms = Date.now() - t0;
  return r;
}

function parseRange(s) {
  const out = [];
  for (const part of s.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let i = a; i <= (b || a); i++) out.push(i);
  }
  return out;
}

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const mmss = (s) => {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};

export function summarise(results) {
  const rows = [];
  const keys = [...new Set(results.map((r) => `${r.field}|${r.sector}`))];
  for (const k of keys) {
    const [field, sector] = k.split('|');
    const rs = results.filter((r) => r.field === field && r.sector === +sector);
    const wins = rs.filter((r) => r.win);
    const avg = (list, f) => (list.length ? list.reduce((a, r) => a + f(r), 0) / list.length : NaN);
    rows.push({
      field,
      sector: +sector,
      runs: rs.length,
      winRate: wins.length / rs.length,
      hits: avg(rs, (r) => r.hits),
      shieldHits: avg(rs, (r) => r.shieldHits),
      time: avg(wins, (r) => r.time),
      bossTime: avg(wins, (r) => r.bossTime),
      score: avg(wins, (r) => r.score),
      ranks: wins.map((r) => r.rank).join(''),
      deaths: rs.filter((r) => !r.win).map((r) => r.deathWave).join(' '),
      minGap: Math.min(...rs.map((r) => r.minGap)),
      blocked: avg(rs, (r) => r.blocked / Math.max(1, r.samples)),
      maxBullets: Math.max(...rs.map((r) => r.maxBullets)),
      unsafe: rs.reduce((a, r) => a + r.unsafe, 0),
      emps: avg(rs, (r) => r.emps),
    });
  }
  return rows;
}

function printTable(rows) {
  const head = ['field', 'sec', 'win', 'hull hits', 'shield hits', 'time', 'boss', 'score', 'ranks', 'died at', 'min gap', 'row blocked', 'max bul', 'unsafe', 'emps'];
  const body = rows.map((r) => [r.field, r.sector, `${Math.round(r.winRate * 100)}%`, fmt(r.hits, 1), fmt(r.shieldHits, 1), Number.isFinite(r.time) ? mmss(r.time) : '-', Number.isFinite(r.bossTime) ? `${fmt(r.bossTime)}s` : '-', fmt(r.score), r.ranks || '-', r.deaths || '-', fmt(r.minGap, 2), `${fmt(r.blocked * 100, 2)}%`, r.maxBullets, r.unsafe, fmt(r.emps, 1)]);
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => String(b[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ');
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  for (const b of body) console.log(line(b));
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, def) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : def;
  };
  const seeds = +arg('seeds', 6);
  const sectors = parseRange(arg('sectors', '1-5'));
  const fields = arg('fields', 'laptop,phone').split(',');
  const showWaves = process.argv.includes('--waves');
  const jobs = [];
  for (const field of fields) for (const sector of sectors) for (let s = 1; s <= seeds; s++) jobs.push({ sector, seed: s * 7919 + sector, field });
  const n = Math.max(1, Math.min(jobs.length, availableParallelism() - 1 || 1));
  const results = [];
  const t0 = Date.now();
  let next = 0;
  await new Promise((done) => {
    let running = 0;
    const launch = () => {
      if (next >= jobs.length) {
        if (running === 0) done();
        return;
      }
      const job = jobs[next++];
      running++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: job });
      w.on('message', (r) => results.push(r));
      w.on('error', (e) => {
        console.error(job, e);
      });
      w.on('exit', () => {
        running--;
        launch();
      });
    };
    for (let i = 0; i < n; i++) launch();
  });
  results.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : a.sector - b.sector || a.seed - b.seed));
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 1));
  if (showWaves) {
    for (const r of results) {
      console.log(`${r.field} s${r.sector} seed ${r.seed} ${r.win ? 'WIN' : 'lost'}: ` + r.waves.map((w) => `${w.wave}:${fmt(w.dur)}s/${w.hits}h/${w.peak}b`).join(' '));
    }
  }
  printTable(summarise(results));
  console.log(`\n${results.length} runs in ${((Date.now() - t0) / 1000).toFixed(1)} s on ${n} threads`);
} else if (!isMainThread) {
  const { sector, seed, field } = workerData;
  parentPort.postMessage(runSector(sector, seed, field));
}
