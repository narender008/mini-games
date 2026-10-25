// Story: flags, line selection, reveals, Memory Threads, endings. Deterministic sim code: no DOM, no Math.random.
//
// ---------------------------------------------------------------- meta fields used (G.meta, saved per profile)
// Owned by run/saves (run.js increments them BEFORE calling onEvent; story.js only reads them):
//   stats.runs (finished runs), stats.started (runs started), stats.deaths, stats.wins (Sable beaten),
//   stats.bossWins{id:n}, stats.bossLosses{id:n}, stats.bossMeets{id:n}, stats.deathsBy{kind:n},
//   stats.weaponRuns{weapon:n}, stats.patronPicks{patron:n}, stats.braids[ids], stats.lastRun
//   { result:'death'|'victory'|'quit', region, chamber, killer, boss, weapon, time }, codex.foes{kind:true}
// Written by story.js:
//   flags{name: true|number}  story flags; numbers are run counts (halvesRun), streak, fresh_<x> (= stats.started
//                              when <x> happened), seen_<region>, endingChoice, trueFight, lastSeenAt, awayLong
//   seen{lineId: count}       every line entry ever shown (barks, hub talk, boss lines, patron card lines)
//   reveals['sable'|'sleep'|'halves'], memories[memoryIds], affinity{npc:n}, gifts{npc:n},
//   ending: null|'first'|'true' (story sets 'true' when the braid is chosen; run.js maxes it with endingState)
//   storyRun { active, patrons{p:n}, region, chambers, barked, winsAtStart, lastBarkT, talked{} }  (run-scoped)
//   storyHub { visit, talked{} }                                                                       (visit-scoped)
// ensureStoryMeta(G) defaults every one of these; it is safe to call at any time.
//
// ---------------------------------------------------------------- events run.js sends: onEvent(G, type, data)
//   'boot'                      once after load (marks long absences)
//   'hubEnter' {from:'new'|'death'|'victory'|'quit'|'continue'}   every arrival in the Loomhall (onboarding fires here)
//   'runStart' {weapon, keepsake}, 'regionEnter' {region, index}, 'chamberEnter' {chamber, depth}, 'waveStart' {wave},
//   'chamberClear', 'boon' {id, patron, braid, patrons?}, 'bossIntro' {id}, 'bossPhase' {id, phase},
//   'bossBark' {id, cue} (optional, from boss AI), 'bossDefeat' {id, first}, 'death' {killer, region, boss},
//   'victory' {ending}, 'fountain' {region}, 'memory' {id}, 'shopBuy' {item}, 'talk' {npc} (same as hubTalk),
//   'gift' {npc} (story increments gifts and affinity)
// onEvent returns an array of resolved entries to show, each
//   { id, speaker, kind, mode: 'dialogue'|'bark', lines: [{ speaker, text, mood }], choices?, gives? }
// and emits bus 'bark' with the same object. Every returned entry is already marked seen.
// Pure getters (no writes, no rng): storyContext, pickLine, patronLine, titleCard, bossCard, codexFor, hasNew,
// speakerName, speakerInfo, hubCast, npcPresent, memoryFor, pickMemory, canTrueEnding, endingState, endingSequence,
// storySummary.
import { DIALOGUE, BY_ID, BY_SPEAKER, BY_EVENT, SPEAKERS, REGION_CARDS, BOSS_CARDS, CODEX, WANDERERS } from '../content/dialogue/index.js';
import { MEMORIES, REGION_MEMORIES, memoryById } from '../content/memories.js';
import { hashSeed } from '../core/rng.js';

export const REVEAL_BY_BOSS = { veyl: 'sable', morrow: 'sleep', aurum: 'halves' };
const GROUP = { sable: ['sable', 'sable_bare'], sable_bare: ['sable_bare', 'sable'] };
const NELL_BOSSES = ['veyl', 'morrow', 'aurum', 'sable'];

// ---------------------------------------------------------------- meta
export function ensureStoryMeta(G) {
  const m = (G.meta ??= {});
  const st = (m.stats ??= {});
  for (const k of ['runs', 'deaths', 'wins', 'clears']) st[k] ??= 0;
  st.started ??= st.runs;
  for (const k of ['bossWins', 'bossLosses', 'bossMeets', 'deathsBy', 'weaponRuns', 'patronPicks']) st[k] ??= {};
  st.braids ??= [];
  m.flags ??= {}; m.seen ??= {}; m.reveals ??= []; m.memories ??= []; m.affinity ??= {}; m.gifts ??= {};
  if (m.ending === undefined) m.ending = null;
  m.codex ??= {}; m.codex.foes ??= {};
  m.storyRun ??= { active: false, patrons: {}, region: null, chambers: 0, barked: false, winsAtStart: st.wins, lastBarkT: -99, talked: {} };
  m.storyRun.patrons ??= {}; m.storyRun.talked ??= {};
  m.storyHub ??= { visit: 0, talked: {} };
  return m;
}

const n0 = (o, k) => (o && o[k]) | 0;
function memCount(m) { return m.memories.filter((id) => memoryById(id)).length; }

export function canTrueEnding(G) {
  const m = ensureStoryMeta(G);
  const wins = m.storyRun.active ? m.storyRun.winsAtStart : m.stats.wins;
  return m.ending !== 'true' && wins >= 3 && memCount(m) >= MEMORIES.length && !!m.flags.confession;
}
export const trueEndingReady = canTrueEnding;

export function storyContext(G, ev = {}) {
  const m = ensureStoryMeta(G); const st = m.stats, fl = m.flags, run = m.storyRun;
  const S = {
    ev: ev || {},
    runs: st.runs, started: st.started, deaths: st.deaths, wins: st.wins, clears: st.wins,
    kills: (id) => n0(st.bossWins, id), losses: (id) => n0(st.bossLosses, id), meets: (id) => n0(st.bossMeets, id),
    weaponRuns: (w) => n0(st.weaponRuns, w), weaponsTried: Object.values(st.weaponRuns).filter((v) => v > 0).length,
    patronPicks: (p) => n0(st.patronPicks, p), braids: st.braids.length,
    f: (k) => fl[k] ?? 0, seen: (id) => !!m.seen[id], mem: (id) => m.memories.includes(id), memCount: memCount(m),
    rev: (id) => m.reveals.includes(id), aff: (npc) => n0(m.affinity, npc), gift: (npc) => n0(m.gifts, npc),
    last: st.lastRun || {}, cur: run, carries: (p) => n0(run.patrons, p),
    ending: m.ending, streak: fl.streak | 0,
    since: (k) => (typeof fl[k] === 'number' ? st.runs - fl[k] : 0),
    fresh: (k) => fl[`fresh_${k}`] === st.started,
    met: (kind) => !!m.codex.foes[kind] || n0(st.deathsBy, kind) > 0,
    nellStage: NELL_BOSSES.filter((b) => n0(st.bossWins, b) > 0).length,
  };
  S.trueReady = canTrueEnding(G);
  return S;
}

// ---------------------------------------------------------------- selection
const onMatches = (e, type) => (Array.isArray(e.on) ? e.on.includes(type) : e.on === type);
function safe(e, S) { try { return !!e.when(S); } catch (err) { return false; } }
function roll(...k) { return hashSeed(...k) / 4294967296; }

// best eligible entry from a list: top priority, least seen, then a stable hash
function choose(G, list, S, type, salt = 0, skip = null) {
  const m = G.meta;
  let best = null, bp = -Infinity, bs = Infinity, bh = Infinity;
  for (const e of list) {
    if (!onMatches(e, type)) continue;
    if (e.once && m.seen[e.id]) continue;
    if (skip && skip.includes(e.id)) continue;
    if (m.ending === 'true' && type === 'talk' && !e.post && e.priority > 10) continue;
    if (!safe(e, S)) continue;
    if (e.chance < 1 && roll(e.id, m.stats.started, m.stats.deaths, salt) > e.chance) continue;
    const s = m.seen[e.id] | 0, h = hashSeed(e.id, m.stats.started, salt, s);
    if (e.priority > bp || (e.priority === bp && (s < bs || (s === bs && h < bh)))) { best = e; bp = e.priority; bs = s; bh = h; }
  }
  return best;
}
function listFor(speaker) { return (GROUP[speaker] ?? [speaker]).flatMap((s) => BY_SPEAKER.get(s) ?? []); }

// pickLine(G, speaker, event): best eligible entry for that speaker (pure; does not mark it)
export function pickLine(G, speaker, event = { type: 'talk' }) {
  ensureStoryMeta(G);
  const ev = typeof event === 'string' ? { type: event } : event;
  return choose(G, listFor(speaker), storyContext(G, ev), ev.type ?? 'talk', G.meta.flags._n | 0);
}

function subst(text, S) { return text.includes('{') ? text.replace('{missing}', String(MEMORIES.length - S.memCount)) : text; }
function resolve(G, e, S) {
  const lines = e.lines.map((l) => ({ speaker: l.speaker, mood: l.mood, text: subst(l.text, S) }));
  return { id: e.id, speaker: e.speaker, kind: e.kind, mode: lines.length > 2 || e.choices ? 'dialogue' : 'bark', lines, choices: e.choices, gives: e.gives };
}

export function markSeen(G, id) { const m = ensureStoryMeta(G); m.seen[id] = (m.seen[id] | 0) + 1; }

function addReveal(G, id) {
  const m = G.meta;
  if (!m.reveals.includes(id)) { m.reveals.push(id); m.flags[`${id}Run`] = m.stats.runs; if (id === 'halves') m.flags.halvesRun = m.stats.runs; G.bus?.emit?.('reveal', { id }); }
}

// mark seen, apply sets/unset, announce gives; returns the resolved entry
export function applyEntry(G, e, S = storyContext(G)) {
  const m = ensureStoryMeta(G);
  markSeen(G, e.id);
  for (const f of e.sets) {
    if (f.startsWith('reveal:')) addReveal(G, f.slice(7));
    else if (f.endsWith('Run')) m.flags[f] = m.stats.runs;
    else m.flags[f] = true;
  }
  for (const f of e.unset) delete m.flags[f];
  if (e.gives) G.bus?.emit?.('storyGive', { id: e.id, speaker: e.speaker, gives: e.gives });
  return resolve(G, e, S);
}

function emit(G, out, r) { if (!r) return; out.push(r); G.bus?.emit?.('bark', r); }
function say(G, out, speaker, ev) {
  const S = storyContext(G, ev);
  const e = choose(G, listFor(speaker), S, ev.type, G.meta.flags._n | 0);
  if (e) emit(G, out, applyEntry(G, e, S));
  return e;
}
// Sable mid-run: never the same line twice in one run, and every line he says resets his chamber cadence
function saySable(G, out, ev) {
  const run = G.meta.storyRun; run.said ??= [];
  const S = storyContext(G, ev);
  const e = choose(G, listFor('sable'), S, ev.type, G.meta.flags._n | 0, run.active ? run.said : null);
  if (!e) return null;
  if (run.active) { run.said.push(e.id); run.lastSableCh = run.chambers | 0; }
  emit(G, out, applyEntry(G, e, S));
  return e;
}

// ---------------------------------------------------------------- events
export function onEvent(G, type, data = {}) {
  const m = ensureStoryMeta(G); const fl = m.flags, st = m.stats, run = m.storyRun;
  fl._n = (fl._n | 0) + 1;
  const ev = { type, ...data };
  const out = [];
  switch (type) {
    case 'boot': {
      const now = typeof Date !== 'undefined' ? Date.now() : 0;
      if (typeof fl.lastSeenAt === 'number' && now - fl.lastSeenAt > 20 * 3600 * 1000) fl.awayLong = true;
      fl.lastSeenAt = now;
      break;
    }
    case 'hubEnter': {
      run.active = false;
      m.storyHub = { visit: (m.storyHub.visit | 0) + 1, talked: {} };
      if (data.from === 'quit') fl.fresh_quit = st.started;
      for (const s of ['orrin', 'thimbleby', 'weaver']) say(G, out, s, ev);
      break;
    }
    case 'runStart': {
      m.storyRun = { active: true, patrons: {}, region: null, chambers: 0, barked: false, winsAtStart: st.wins, lastBarkT: -99, talked: {}, weapon: data.weapon ?? null, said: [], lastSableCh: -2, rolledCh: -1 };
      delete fl.endingChoice; delete fl.trueFight;
      say(G, out, 'narrator', ev);
      break;
    }
    case 'regionEnter': {
      run.region = data.region ?? null;
      say(G, out, 'narrator', ev);
      saySable(G, out, ev);
      if (data.region) fl[`seen_${data.region}`] = true;
      break;
    }
    case 'chamberEnter': run.chambers = (run.chambers | 0) + 1; run.barked = false; break;
    case 'waveStart': {
      // one decision per chamber (a chamber has several waves), at most one line, never a line twice in a run
      if (run.barked || run.rolledCh === run.chambers) break;
      run.said ??= []; if (run.lastSableCh == null) run.lastSableCh = -2;
      const S = storyContext(G, ev);
      const e = choose(G, listFor('sable'), S, 'waveStart', fl._n, run.said);
      if (!e) break;
      // story beats always land; idle taunts about one chamber in three (never two chambers running, always by the fourth)
      if (e.priority < 50) {
        run.rolledCh = run.chambers;
        const gap = (run.chambers | 0) - run.lastSableCh;
        if (!(gap >= 4 || (gap >= 2 && roll('wave', st.started, run.chambers) < 0.5))) break;
      }
      run.barked = true; run.said.push(e.id); run.lastSableCh = run.chambers | 0;
      emit(G, out, applyEntry(G, e, S));
      break;
    }
    case 'boon': {
      if (data.patron) run.patrons[data.patron] = (run.patrons[data.patron] | 0) + 1;
      if (data.braid) {
        const ps = data.patrons ?? Object.keys(run.patrons);
        const bev = { type: 'braid', patrons: ps, id: data.id };
        const S = storyContext(G, bev);
        const e = choose(G, BY_EVENT.get('braid') ?? [], S, 'braid', fl._n);
        if (e) emit(G, out, applyEntry(G, e, S));
        saySable(G, out, ev);
      }
      break;
    }
    case 'bossIntro': {
      if (data.id === 'sable') fl.trueFight = canTrueEnding(G) ? st.started : 0;
      say(G, out, data.id, ev);
      break;
    }
    case 'bossPhase': say(G, out, data.id, ev); break;
    case 'bossBark': {
      const t = G.t ?? 0;
      if (t - (run.lastBarkT ?? -99) < 7) break;
      if (roll('bark', fl._n, st.started) > 0.5) break;
      run.lastBarkT = t; say(G, out, data.id, ev);
      break;
    }
    case 'bossDefeat': {
      fl[`fresh_win_${data.id}`] = st.started;
      // the defeat lines are picked first (they reveal), then the reveal is applied even if a line was missing
      say(G, out, data.id, ev);
      const rv = REVEAL_BY_BOSS[data.id];
      if (rv && (data.first || n0(st.bossWins, data.id) >= 1)) addReveal(G, rv);
      if (data.id !== 'sable') saySable(G, out, ev); // Sable comments on a guardian's fall
      break;
    }
    case 'death': {
      fl.streak = 0;
      if (data.boss && data.boss !== 'sable') say(G, out, data.boss, ev);
      say(G, out, 'sable', ev);
      run.active = false;
      break;
    }
    case 'victory': fl.streak = (fl.streak | 0) + 1; run.active = false; break;
    case 'fountain': say(G, out, 'narrator', ev); break;
    case 'memory': {
      if (data.id && !m.memories.includes(data.id)) m.memories.push(data.id);
      say(G, out, 'narrator', ev);
      saySable(G, out, ev);
      break;
    }
    case 'shopBuy': say(G, out, 'pell', ev); break;
    case 'talk': { const r = hubTalk(G, data.npc); if (r) out.push(r); break; }
    case 'gift': {
      if (!data.npc) break;
      m.gifts[data.npc] = (m.gifts[data.npc] | 0) + 1;
      m.affinity[data.npc] = (m.affinity[data.npc] | 0) + 2;
      say(G, out, data.npc, ev);
      break;
    }
    default: break;
  }
  return out;
}

// ---------------------------------------------------------------- hub
const NPC_SPEAKER = { sable: 'sable_bare' };
// hubTalk(G, npcId) -> resolved entry (marks it seen; raises affinity once per hub visit or run)
export function hubTalk(G, npc) {
  const m = ensureStoryMeta(G);
  const speaker = NPC_SPEAKER[npc] ?? npc;
  const talked = m.storyRun.active ? m.storyRun.talked : m.storyHub.talked;
  if (!talked[npc]) { talked[npc] = true; m.affinity[npc] = (m.affinity[npc] | 0) + 1; }
  const ev = { type: 'talk', npc };
  const S = storyContext(G, ev);
  const e = choose(G, listFor(speaker), S, 'talk', m.flags._n | 0);
  if (!e) return null;
  const r = applyEntry(G, e, S);
  return r;
}

// a once-entry with real story weight is waiting (for a '!' marker over the NPC)
export function hasNew(G, npc) {
  const m = ensureStoryMeta(G);
  const speaker = NPC_SPEAKER[npc] ?? npc;
  const S = storyContext(G, { type: 'talk', npc });
  for (const e of listFor(speaker)) if (e.once && e.priority >= 20 && !m.seen[e.id] && onMatches(e, 'talk') && safe(e, S)) return true;
  return false;
}

export function npcPresent(G, id) {
  const S = storyContext(G);
  switch (id) {
    case 'orrin': case 'thimbleby': case 'pell': case 'weaver': return true;
    case 'nell': return S.nellStage >= 1 && !(S.ending === 'true' && S.seen('nell_epilogue') && S.since('trueRun') >= 1);
    case 'sable': case 'sable_bare': return S.ending === 'true';
    default: return Object.values(WANDERERS).includes(id);
  }
}
export function hubCast(G) { return ['orrin', 'thimbleby', 'pell', 'nell', 'weaver', 'sable'].filter((id) => npcPresent(G, id)); }

// ---------------------------------------------------------------- names, cards, patrons, codex
export function speakerInfo(G, id) {
  const sp = SPEAKERS[id] ?? { name: id, title: '', color: '#f3ead8' };
  if ((id === 'sable') && G && !ensureStoryMeta(G).reveals.includes('sable')) return { ...sp, name: 'The Unweaver', title: 'who speaks when you fall' };
  return sp;
}
export function speakerName(G, id) { return speakerInfo(G, id).name; }

export function patronLine(G, patron, boonId = null) {
  ensureStoryMeta(G);
  const ev = { type: 'offer', patron, boon: boonId };
  const S = storyContext(G, ev);
  const e = choose(G, BY_SPEAKER.get(patron) ?? [], S, 'offer', hashSeed(boonId ?? '', G.run?.seed ?? 0) & 1023);
  if (!e) return null;
  const l = e.lines[0];
  return { id: e.id, speaker: l.speaker, mood: l.mood, text: subst(l.text, S), lines: e.lines };
}

export function titleCard(G, region) {
  const card = REGION_CARDS[region]; if (!card) return null;
  const S = storyContext(G, { type: 'regionEnter', region });
  const e = choose(G, BY_SPEAKER.get('narrator') ?? [], S, 'regionEnter', 0);
  return { ...card, region, line: e ? e.lines[0].text : '' };
}
export function bossCard(G, id) {
  const c = BOSS_CARDS[id]; if (!c) return null;
  if (c.preReveal && !ensureStoryMeta(G).reveals.includes('sable')) return { ...c, ...c.preReveal };
  return c;
}

export function codexFor(G) {
  const S = storyContext(G);
  const out = {};
  for (const [cat, list] of Object.entries(CODEX)) {
    out[cat] = list.map((x) => ({ id: x.id, name: x.name, title: x.title, pages: x.pages.filter((p) => safe(p, S)).map((p) => p.text) })).filter((x) => x.pages.length);
    if (cat === 'characters') for (const x of out[cat]) if (x.id === 'sable' && !S.rev('sable')) { x.name = 'The Unweaver'; x.title = 'who speaks when you fall'; }
  }
  return out;
}

// ---------------------------------------------------------------- Memory Threads
// which Memory Thread a fountain or memory chamber in this region holds (pure; null when none is due)
export function memoryFor(G, region) {
  const S = storyContext(G);
  for (const id of REGION_MEMORIES[region] ?? []) { if (S.mem(id)) continue; const mm = memoryById(id); if (mm && safe({ when: mm.gate }, S)) return id; }
  return null;
}
export function pickMemory(G, region = null) {
  const m = ensureStoryMeta(G);
  return memoryFor(G, region ?? G.run?.region ?? m.storyRun.region ?? 'glasswood');
}
export function memoriesSeen(G) { const m = ensureStoryMeta(G); return MEMORIES.filter((x) => m.memories.includes(x.id)).sort((a, b) => a.n - b.n); }

// ---------------------------------------------------------------- endings
// endingState(G): which ending this Sable win earns: 'true' when the braid fight was ready (and not refused), else 'first'.
// Call before onEvent('victory'). Returns null outside a Sable win context only if the save has no wins at all.
export function endingState(G) {
  const m = ensureStoryMeta(G); const fl = m.flags;
  if (m.ending === 'true') return 'true';
  const ready = fl.trueFight === m.stats.started && fl.trueFight !== 0 && fl.trueFight !== undefined;
  if ((ready || canTrueEnding(G)) && fl.endingChoice !== 'cut') return 'true';
  if (m.stats.wins >= 1 || m.ending === 'first') return 'first';
  return null;
}
// chooseEnding(G, 'braid'|'cut'): the player's answer to the choice on Sable's last defeat line
export function chooseEnding(G, choice) {
  const m = ensureStoryMeta(G);
  m.flags.endingChoice = choice;
  if (choice === 'braid') { m.ending = 'true'; m.flags.trueRun = m.stats.runs; G.bus?.emit?.('ending', { kind: 'true' }); }
  return endingSequence(G);
}
// which ENDINGS sequences the UI should play after this victory: ['first'] | ['true','epilogue'] | ['cut'] | null
export function endingSequence(G) {
  const m = ensureStoryMeta(G); const fl = m.flags;
  if (fl.endingChoice === 'braid') return ['true', 'epilogue'];
  if (fl.endingChoice === 'cut') return ['cut'];
  if (m.stats.wins === 1 && m.ending !== 'true') return ['first'];
  return null;
}

// ---------------------------------------------------------------- state() summary for the test hook
export function storySummary(G) {
  const m = ensureStoryMeta(G);
  const flags = {}; for (const [k, v] of Object.entries(m.flags)) if (!k.startsWith('_')) flags[k] = v;
  return { runs: m.stats.runs, wins: m.stats.wins, deaths: m.stats.deaths, seen: Object.keys(m.seen), flags, memoryThreads: [...m.memories], reveals: [...m.reveals], ending: m.ending };
}

export const STORY_EVENTS = ['boot', 'hubEnter', 'runStart', 'regionEnter', 'chamberEnter', 'waveStart', 'chamberClear', 'boon', 'bossIntro', 'bossPhase', 'bossBark', 'bossDefeat', 'death', 'victory', 'fountain', 'memory', 'shopBuy', 'talk', 'gift'];
export { DIALOGUE, BY_ID };
