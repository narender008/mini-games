// Headless autopilot run: a fresh colony played by src/bot.js through act.*
// only (no give, no unlock), stepping the sim with no DOM.
//
//   node games/skyforge/dev/bot-run.mjs <seed> <hours> [--difficulty standard] [--md out.md] [--json out.json] [--log]
//
// Prints time to each chapter and to the win, stalls (what the bot waited on,
// and building stall reasons weighted by time), and stockpile curves. Exit code
// 0 when the colony won inside <hours> of game time, 1 otherwise.
import { writeFileSync } from 'node:fs';
import { createGame } from '../src/state.js';
import { initSim, tick } from '../src/sim/index.js';
import { makeActions } from '../src/sim/actions.js';
import { DT } from '../src/config.js';
import * as C from '../src/content/index.js';
import { createBrain } from '../src/bot.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const VALUED = new Set(['--difficulty', '--md', '--json']);
const pos = args.filter((a, i) => !a.startsWith('--') && !VALUED.has(args[i - 1]));
const seed = (parseInt(pos[0] ?? '1', 10) >>> 0) || 1;
const hours = +(pos[1] ?? 4);
const difficulty = opt('difficulty', 'standard');

export function runBot({ seed = 1, hours = 4, difficulty = 'standard', log = false, onSample } = {}) {
  const G = createGame({ seed, difficulty });
  initSim(G);
  const act = makeActions(() => G);
  const brain = createBrain({ getG: () => G, act, C, log: log ? (t) => console.log(`[${fmt(G.t)}] ${t}`) : null });
  const marks = {};            // milestone -> game seconds
  const events = [];
  const mark = (k) => { if (marks[k] == null) marks[k] = G.t; };
  const on = (ev, fn) => G.bus.on(ev, fn);
  on('chapter', (e) => { mark('chapter ' + (e?.id ?? G.goals.chapter)); });
  on('won', () => mark('won'));
  on('research:done', (e) => mark('research ' + e.id));
  on('island:claimed', (e) => mark('claim ' + (e.i?.id ?? e.id)));
  on('build:done', (e) => mark('first ' + e.b?.type));
  on('link:built', (e) => mark('first link ' + e.l?.kind));
  on('raid:start', () => events.push({ t: G.t, k: 'raid' }));
  on('raid:end', (e) => events.push({ t: G.t, k: 'raid end', loot: e?.raid?.loot }));
  on('storm:start', (e) => events.push({ t: G.t, k: 'storm', power: e?.power }));
  on('stall', () => {});

  const samples = [];
  const stallT = {};           // building stall reason -> building-seconds
  const end = hours * 3600;
  const steps1s = Math.round(1 / DT);
  const wall0 = Date.now();
  let lastChapter = G.goals.chapter;
  while (G.t < end && !G.goals.won) {
    for (let i = 0; i < steps1s; i++) tick(G);
    if (G.event) brain.onEvent();
    brain.think();
    if (G.goals.chapter !== lastChapter) { mark('chapter ' + G.goals.chapter); lastChapter = G.goals.chapter; }
    if ((Math.round(G.t) % 10) === 0) for (const b of G.buildings) if (b.state === 'built' && b.stall) stallT[b.stall] = (stallT[b.stall] || 0) + 10;
    if ((Math.round(G.t) % 60) === 0) {
      const s = sample(G);
      samples.push(s);
      onSample?.(s);
    }
  }
  if (G.goals.won) mark('won');
  return { G, seed, hours, difficulty, marks, events, samples, stallT, waits: brain.waits(), actions: brain.counts(), wallMs: Date.now() - wall0, brain };
}

function sample(G) {
  const res = {};
  for (const p of Object.values(G.pools)) for (const [k, v] of Object.entries(p.res || {})) res[k] = (res[k] || 0) + v;
  res.coin = G.colony.coin ?? res.coin ?? 0; res.insight = G.colony.insight ?? res.insight ?? 0;
  return {
    t: Math.round(G.t), day: G.day, chapter: G.goals.chapter, pop: Math.round(G.colony.pop || 0), popCap: G.colony.popCap || 0,
    idle: G.colony.idle || 0, happy: +(G.colony.happiness || 0).toFixed(2), res: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, Math.round(v)])),
    buildings: G.buildings.length, islands: G.islands.filter((i) => i.owned).length, research: G.research.done.length,
  };
}

export const fmt = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}h${String(m).padStart(2, '0')}`; };

export function report(r) {
  const L = [];
  const won = r.marks.won != null;
  L.push(`# Skyforge bot run: seed ${r.seed}, ${r.difficulty}, budget ${r.hours} h`);
  L.push('');
  L.push(`Result: **${won ? 'WON at ' + fmt(r.marks.won) : 'not won'}** (game time; day ${r.G.day}), wall ${(r.wallMs / 1000).toFixed(1)} s, chapter ${r.G.goals.chapter}, pop ${Math.round(r.G.colony.pop)}.`);
  L.push('');
  L.push('## Milestones (game time)');
  const target = Object.fromEntries(C.CHAPTERS.map((c) => [c.n, c.target]));
  for (const [k, t] of Object.entries(r.marks).sort((a, b) => a[1] - b[1])) {
    const m = /^chapter (\d+)/.exec(k);
    L.push(`- ${fmt(t)}  ${k}${m && target[+m[1] - 1] ? `  (chapter ${+m[1] - 1} target ${target[+m[1] - 1]} min)` : ''}`);
  }
  L.push('');
  L.push('## Threats');
  for (const e of r.events) L.push(`- ${fmt(e.t)} ${e.k}${e.power ? ' power ' + e.power.toFixed(2) : ''}${e.loot ? ' loot ' + JSON.stringify(e.loot) : ''}`);
  if (!r.events.length) L.push('- none');
  L.push('');
  L.push('## Stalls');
  L.push('Building stall reasons (building-minutes):');
  for (const [k, v] of Object.entries(r.stallT).sort((a, b) => b[1] - a[1]).slice(0, 12)) L.push(`- ${k}: ${Math.round(v / 60)}`);
  L.push('');
  L.push('What the bot waited on longest (game minutes blocked):');
  for (const [k, v] of Object.entries(r.waits).sort((a, b) => b[1] - a[1]).slice(0, 15)) L.push(`- ${k}: ${Math.round(v / 60)}`);
  L.push('');
  L.push('## Stockpiles (every 15 min)');
  const keys = ['wood', 'planks', 'stone', 'grain', 'flour', 'bread', 'ore', 'coal', 'iron', 'parts', 'skystone', 'aether', 'coin', 'insight'];
  L.push('| t | ch | pop/cap | idle | happy | ' + keys.join(' | ') + ' | bld | isl | tech |');
  L.push('|' + '---|'.repeat(keys.length + 8));
  for (const s of r.samples.filter((s) => s.t % 900 === 0)) {
    L.push(`| ${fmt(s.t)} | ${s.chapter} | ${s.pop}/${s.popCap} | ${s.idle} | ${s.happy} | ` + keys.map((k) => s.res[k] ?? 0).join(' | ') + ` | ${s.buildings} | ${s.islands} | ${s.research} |`);
  }
  L.push('');
  L.push('## Actions taken');
  L.push(Object.entries(r.actions).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runBot({ seed, hours, difficulty, log: flag('log') });
  const md = report(r);
  console.log(md);
  if (opt('md')) writeFileSync(opt('md'), md);
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify({ seed, hours, difficulty, marks: r.marks, events: r.events, samples: r.samples, stallT: r.stallT, waits: r.waits }, null, 1));
  process.exit(r.marks.won != null ? 0 : 1);
}
