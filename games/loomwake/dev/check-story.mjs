// Story check: node games/loomwake/dev/check-story.mjs [runs=30] [--quiet]
// 1. loads all dialogue, memories, endings and codex; checks unique ids, valid speakers and moods, that every
//    `when` runs on a default context, and that memories/endings are well formed;
// 2. simulates N runs of event sequences the way run.js sends them (stats incremented before onEvent) and prints
//    which lines fire, run by run, so the story can be read in the order a player meets it.
import { DIALOGUE, BY_ID, SPEAKERS, LINE_COUNT, GROUPS } from '../src/content/dialogue/index.js';
import { MEMORIES, REGION_MEMORIES } from '../src/content/memories.js';
import { ENDINGS } from '../src/content/dialogue/endings.js';
import { CODEX } from '../src/content/dialogue/codex.js';
import * as story from '../src/sim/story.js';
import { rng } from '../src/core/rng.js';

const args = process.argv.slice(2);
const RUNS = Number(args.find((a) => /^\d+$/.test(a)) ?? 30);
const QUIET = args.includes('--quiet');
const VERBOSE = args.includes('--text');
let errors = 0;
const err = (...a) => { errors++; console.error('ERROR', ...a); };

// ---------------------------------------------------------------- static checks
const MOODS = new Set(['neutral', 'happy', 'sad', 'grave', 'wry', 'angry', 'surprised', 'afraid', 'warm']);
const ids = new Set();
for (const e of DIALOGUE) {
  if (!e.id) err('entry without id', e);
  if (ids.has(e.id)) err('duplicate id', e.id); ids.add(e.id);
  if (!SPEAKERS[e.speaker]) err('unknown speaker', e.id, e.speaker);
  if (!e.lines.length) err('no lines', e.id);
  for (const l of e.lines) {
    if (!SPEAKERS[l.speaker]) err('unknown line speaker', e.id, l.speaker);
    if (!MOODS.has(l.mood)) err('unknown mood', e.id, l.mood);
    if (!l.text || /^[@#]/.test(l.text)) err('bad line text', e.id, JSON.stringify(l.text));
  }
}
const G0 = { meta: {}, bus: null, t: 0 };
const S0 = story.storyContext(G0, { type: 'talk' });
for (const e of DIALOGUE) { try { e.when(S0); } catch (x) { err('when throws on default context', e.id, x.message); } }
for (const ev of ['death', 'bossIntro', 'offer', 'braid', 'hubEnter', 'regionEnter', 'bossDefeat', 'memory']) {
  const S = story.storyContext(G0, { type: ev, id: 'veyl', boss: 'veyl', region: 'glasswood', patron: 'maru', patrons: ['maru', 'veyra'], from: 'death' });
  for (const e of DIALOGUE) { try { e.when(S); } catch (x) { err(`when throws on ${ev}`, e.id, x.message); } }
}
let memLines = 0, endLines = 0;
const memIds = new Set();
for (const m of MEMORIES) {
  if (memIds.has(m.id)) err('duplicate memory', m.id); memIds.add(m.id);
  if (m.panels.length < 3 || m.panels.length > 4) err('memory panel count', m.id, m.panels.length);
  for (const p of m.panels) { if (typeof p.paint !== 'function') err('panel without paint', m.id); for (const l of p.lines) { memLines++; if (!SPEAKERS[l.speaker]) err('memory speaker', m.id, l.speaker); } }
  try { m.gate(S0); } catch (x) { err('memory gate throws', m.id); }
}
if (MEMORIES.length !== 12) err('expected 12 memories, got', MEMORIES.length);
const inRegions = Object.values(REGION_MEMORIES).flat();
for (const id of memIds) if (!inRegions.includes(id)) err('memory not placed in a region', id);
for (const id of inRegions) if (!memIds.has(id)) err('region lists unknown memory', id);
for (const [k, s] of Object.entries(ENDINGS)) for (const p of s.panels) for (const l of p.lines) { endLines++; if (!SPEAKERS[l.speaker]) err('ending speaker', k, l.speaker); }
let codexPages = 0;
for (const list of Object.values(CODEX)) for (const x of list) for (const p of x.pages) { codexPages++; try { p.when(S0); } catch (e) { err('codex when throws', x.id); } }
// every reveal-bearing and choice entry exists
for (const id of ['orrin_intro', 'thimbleby_intro', 'sable_death_first', 'veyl_defeat_first', 'morrow_defeat_first', 'aurum_defeat_first', 'sableboss_defeat_first', 'sableboss_defeat_true', 'orrin_confession']) if (!BY_ID.has(id)) err('missing key entry', id);

console.log(`dialogue: ${DIALOGUE.length} entries, ${LINE_COUNT} lines (` + Object.entries(GROUPS).map(([k, v]) => `${k} ${v.reduce((n, e) => n + e.lines.length, 0)}`).join(', ') + ')');
console.log(`memories: ${MEMORIES.length} threads, ${MEMORIES.reduce((n, m) => n + m.panels.length, 0)} panels, ${memLines} lines; endings: ${Object.keys(ENDINGS).length} sequences, ${endLines} lines; codex: ${codexPages} pages`);
console.log(`total spoken/narrated lines: ${LINE_COUNT + memLines + endLines}`);

// ---------------------------------------------------------------- simulation
const R = rng(20261025);
const G = { meta: {}, bus: { emit() {} }, t: 0, run: null };
const m = story.ensureStoryMeta(G);
const st = m.stats;
const fired = [];
let current = [];
const log = (tag, rs) => { for (const r of rs) { current.push(`${tag}:${r.id}`); fired.push(r.id); if (VERBOSE) for (const l of r.lines) console.log(`      ${l.speaker.padEnd(10)} ${l.text}`); if (r.choices) story.chooseEnding(G, 'braid'); } };
const inc = (o, k, n = 1) => { o[k] = (o[k] | 0) + n; };
const WEAPONS = ['blade', 'blade', 'spear', 'blade', 'bow', 'gauntlets', 'blade', 'chakram'];
const PATRONS = ['solenne', 'maru', 'veyra', 'ossian', 'ilu', 'kestrel'];
const REG = [['glasswood', 'veyl'], ['choir', 'morrow'], ['forge', 'aurum'], ['unwoven', 'sable']];
const KILLERS = { glasswood: ['hollow', 'thornling', 'threadKnight'], choir: ['chorister', 'snarl', 'lanternWarden'], forge: ['forgeThrall', 'bellowsBrute'], unwoven: ['echo', 'unspooler'] };

function hubVisit(from) {
  log('hub', story.onEvent(G, 'hubEnter', { from }));
  for (const npc of story.hubCast(G)) { const r = story.hubTalk(G, npc); if (r) log(`talk.${npc}`, [r]); }
}

log('boot', story.onEvent(G, 'boot'));
hubVisit('new');
let skill = 0.25;
for (let run = 1; run <= RUNS; run++) {
  current = [];
  const weapon = WEAPONS[(run - 1) % WEAPONS.length];
  inc(st, 'started'); inc(st.weaponRuns, weapon);
  log('run', story.onEvent(G, 'runStart', { weapon }));
  let result = null, at = null, killer = null, boss = null;
  for (let ri = 0; ri < 4 && !result; ri++) {
    const [region, bossId] = REG[ri];
    G.run = { region, seed: run * 7 + ri };
    log('region', story.onEvent(G, 'regionEnter', { region, index: ri }));
    for (let c = 0; c < 4 && !result; c++) {
      log('chamber', story.onEvent(G, 'chamberEnter', { chamber: c, depth: ri * 12 + c }));
      m.codex.foes[KILLERS[region][c % KILLERS[region].length]] = true;
      for (let w = 0; w < 3; w++) log('wave', story.onEvent(G, 'waveStart', { wave: w }));
      const patron = PATRONS[Math.floor(R() * 6)];
      const pl = story.patronLine(G, patron, `${patron}_x`); if (pl) { story.markSeen(G, pl.id); current.push(`offer:${pl.id}`); fired.push(pl.id); }
      inc(st.patronPicks, patron);
      const braid = c === 3 && R() < 0.3;
      if (braid) st.braids.push(`braid${st.braids.length}`);
      log('boon', story.onEvent(G, 'boon', { id: `${patron}_x`, patron, braid }));
      if (c === 1) {
        log('fountain', story.onEvent(G, 'fountain', { region }));
        const mem = story.pickMemory(G);
        if (mem) log(`memory.${mem}`, story.onEvent(G, 'memory', { id: mem }));
        const w = { glasswood: 'hob', choir: 'lisle', forge: 'gilt', unwoven: 'ash' }[region];
        const r = story.hubTalk(G, w); if (r) log(`talk.${w}`, [r]);
      }
      if (R() > 0.93 + skill * 0.06) { result = 'death'; killer = KILLERS[region][Math.floor(R() * KILLERS[region].length)]; at = region; }
      log('clear', story.onEvent(G, 'chamberClear'));
    }
    if (result) break;
    inc(st.bossMeets, bossId);
    log('boss', story.onEvent(G, 'bossIntro', { id: bossId }));
    log('boss', story.onEvent(G, 'bossPhase', { id: bossId, phase: 2 }));
    G.t += 30; log('bark', story.onEvent(G, 'bossBark', { id: bossId, cue: 'hurt' }));
    const odds = skill - ri * 0.12 + (st.bossLosses[bossId] | 0) * 0.08;
    if (R() < odds) {
      const first = !st.bossWins[bossId]; inc(st.bossWins, bossId);
      if (bossId === 'sable') inc(st, 'wins');
      log('defeat', story.onEvent(G, 'bossDefeat', { id: bossId, first }));
      if (bossId === 'sable') result = 'victory';
    } else { result = 'death'; boss = bossId; killer = bossId; at = region; inc(st.bossLosses, bossId); }
  }
  inc(st, 'runs');
  if (result === 'death') {
    inc(st, 'deaths'); inc(st.deathsBy, killer);
    st.lastRun = { result, region: at, killer, boss, weapon };
    log('death', story.onEvent(G, 'death', { killer, region: at, boss }));
  } else {
    st.lastRun = { result: 'victory', region: 'unwoven', weapon };
    const end = story.endingState(G);
    const order = [null, 'first', 'true'];
    if (order.indexOf(end) > order.indexOf(m.ending)) m.ending = end;
    log('victory', story.onEvent(G, 'victory', { ending: end }));
    current.push(`ENDING ${JSON.stringify(story.endingSequence(G))}`);
  }
  G.run = null;
  if (run % 3 === 0) { const npc = ['orrin', 'thimbleby', 'pell', 'nell'][(run / 3) % 4]; if (story.npcPresent(G, npc)) log(`gift.${npc}`, story.onEvent(G, 'gift', { npc })); }
  hubVisit(result === 'death' ? 'death' : 'victory');
  skill = Math.min(0.98, skill + 0.07);
  if (!QUIET) console.log(`\nrun ${String(run).padStart(2)} ${result.padEnd(7)} ${at ?? 'unwoven'} ${boss ?? ''} | reveals ${m.reveals.join(',') || '-'} | mem ${m.memories.length} | wins ${st.wins} | ending ${m.ending}\n   ` + current.join('  '));
}

const S = story.storyContext(G);
console.log(`\nafter ${RUNS} runs: deaths ${st.deaths}, wins ${st.wins}, reveals [${m.reveals}], memories ${m.memories.length}/12, confession ${!!m.flags.confession}, ending ${m.ending}, distinct entries seen ${Object.keys(m.seen).length}/${DIALOGUE.length}, nellStage ${S.nellStage}`);
const summary = story.storySummary(G);
if (!summary.seen.includes('sable_death_first')) err('Sable never spoke on the first death');
for (const r of ['sable', 'sleep', 'halves']) if (!m.reveals.includes(r)) console.warn('warn: reveal not reached in this simulation:', r);
if (RUNS >= 30 && m.ending !== 'true') console.warn('warn: true ending not reached in', RUNS, 'runs');
if (errors) { console.error(`\n${errors} error(s)`); process.exit(1); }
console.log('story check ok');
