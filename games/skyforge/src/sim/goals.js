// Goals (PROGRESSION): seven chapters of checkable steps with tutorial hints and
// rewards, the Skyforge's five stages, the Dreadnought finale and victory,
// achievements, and event cards (choices with trade-offs).
//
// G.goals = { chapter 1..7, steps:{id:true}, done:[chapter ids], flags:{}, won, wonAt, achievements:[ids],
//             meta: { chapterAt:{n: t}, stepAt:{id: t}, nextEvent, seen:{eventId: day}, lastFireDay,
//                     happySince, inStorm, inRaid, finalAt, finalRetryAt } }
// flags other areas read or set: stormSurvived, raidSurvived, roostTaken (chart), finalRaid,
//   dreadnoughtDown (THREATS sets it when the Dreadnought falls), firstContract (trade).
// G.tmp.goalSteps = [{ id, text, done, hint: { text, island, u, v, type, open, tech, target } }]
// G.tmp.goal = { n, id, name, desc, target, done, total }, G.tmp.skyforgeProgress 0..1
// G.event = null | { id, title, text, art, options:[{ label, desc, cost, ok }], at }
// G.colony.boosts = [{ kind:'happiness'|'production'|'growth', v, until }] (ECONOMY applies them)
// Skyforge stages: islands.upgrade() for a skyforge calls forgeUpgrade(G, b); b.forge = { stage, t, time }
// while a stage is being raised; b.level = stages done (0..5).
import { CHAPTERS, SKYFORGE_STAGES } from '../content/goals.js';
import { EVENTS } from '../content/events.js';
import { ACHIEVEMENTS } from '../content/achievements.js';
import { RESEARCH } from '../content/research.js';
import { CFG, DAY } from '../config.js';
import * as research from './research.js';
import * as trade from './trade.js';
import * as chart from './chart.js';
import * as islands from './islands.js';
import * as economy from './economy.js';
import * as weather from './weather.js';
import * as raids from './raids.js';
import { pay, payOn, missingOn, gain, missing, rootOf, homeRoot, notify, islandById, owned, bump, costText } from './ledger.js';

const C = () => CFG.progression.goals;
const EV = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export function init(G) {
  G.goals = { chapter: 1, steps: {}, done: [], flags: {}, won: false, wonAt: null, achievements: [], meta: null };
  G.event = null;
  ensureMeta(G);
  G.goals.meta.chapterAt[1] = G.t;
}

function ensureMeta(G) {
  const m = G.goals.meta || (G.goals.meta = {});
  m.chapterAt = m.chapterAt || {};
  m.stepAt = m.stepAt || {};
  m.seen = m.seen || {};
  if (m.nextEvent == null) m.nextEvent = C().eventFirstDay * DAY + 120;
  if (m.lastFireDay == null) m.lastFireDay = G.day;
  return m;
}

export function hydrate(G) {
  G.goals.steps = G.goals.steps || {}; G.goals.flags = G.goals.flags || {}; G.goals.achievements = G.goals.achievements || [];
  ensureMeta(G);
  G.colony.boosts = G.colony.boosts || [];
  G.tmp.goalT = 0; G.tmp.hints = {}; G.tmp.hintT = 0;
  G.tmp.skyforgeProgress = forgeProgress(G);
  refreshSteps(G);
}

// ---- step checks ------------------------------------------------------------------------
const builtCount = (G, type) => G.buildings.filter((b) => b.type === type && b.state === 'built').length;
const skyforge = (G) => G.buildings.find((b) => b.type === 'skyforge' && b.state === 'built') || null;
export const forgeStage = (G) => (skyforge(G) ? skyforge(G).level || 0 : 0);

function anyStock(G, res) {
  if (res === 'coin' || res === 'insight') return G.colony[res] || 0;
  let m = 0; for (const p of Object.values(G.pools)) m = Math.max(m, p.res?.[res] || 0); return m;
}

export function check(G, c) {
  const T = G.stats.totals || {};
  if (c.built) return builtCount(G, c.built.type) >= (c.built.n || 1);
  if (c.pop != null) return (G.colony.pop || 0) >= c.pop;
  if (c.popCap != null) return (G.colony.popCap || 0) >= c.popCap;
  if (c.owned != null) return owned(G).length >= c.owned;
  if (c.island) return !!islandById(G, c.island)?.owned;
  if (c.link) return G.links.filter((l) => l.kind === c.link.kind && l.state === 'built').length >= (c.link.n || 1);
  if (c.researched != null) return G.research.done.length >= c.researched;
  if (c.tech) return G.research.done.includes(c.tech);
  if (c.contracts) return (T['contracts:' + c.contracts.port] || 0) >= c.contracts.n;
  if (c.ships) return G.ships.filter((s) => s.kind === c.ships.kind && s.state !== 'building').length >= c.ships.n;
  if (c.trips != null) return (T.trips || 0) >= c.trips;
  if (c.routes != null) return G.routes.length >= c.routes;
  if (c.flag) return !!G.goals.flags[c.flag];
  if (c.stage != null) return forgeStage(G) >= c.stage;
  if (c.stock) return Object.entries(c.stock).every(([r, n]) => anyStock(G, r) >= n);
  return false;
}

// ---- hints ---------------------------------------------------------------------------------
function resolveHint(G, h) {
  if (!h) return null;
  const out = { text: h.text, island: h.island || null, u: null, v: null, type: h.type || null, open: h.open || null, tech: h.tech || null, target: h.target || null };
  const i = h.island ? islandById(G, h.island) : null;
  if (h.type && i) {
    const ex = G.buildings.find((b) => b.type === h.type && b.island === i.id);
    let spot = ex ? [ex.u, ex.v] : null;
    if (!spot && h.type !== 'bridge' && h.type !== 'cable') {
      try { const s = islands.spots(G, h.type, i.id); if (s && s.length) spot = s[0]; } catch (e) { spot = null; }
    }
    if (spot) { out.u = spot[0]; out.v = spot[1]; }
    else { out.u = Math.floor(i.w / 2); out.v = Math.floor(i.h / 2); }
  }
  // point the research hint at the next step on the way to the tech
  if (h.tech && !G.research.done.includes(h.tech)) out.tech = nextTowards(G, h.tech);
  return out;
}

function nextTowards(G, id) {
  const R = G.research;
  const seen = new Set();
  const walk = (x) => {
    if (seen.has(x)) return null; seen.add(x);
    const r = research.BY_ID[x]; if (!r || R.done.includes(x)) return null;
    for (const n of r.needs) { const k = walk(n); if (k) return k; }
    return x;
  };
  return walk(id) || id;
}

function refreshSteps(G) {
  const ch = CHAPTERS[Math.min(CHAPTERS.length, G.goals.chapter) - 1];
  if (!ch) { G.tmp.goalSteps = []; return; }
  const hints = G.tmp.hints || (G.tmp.hints = {});
  G.tmp.goalSteps = ch.steps.map((s) => ({ id: s.id, text: s.text, done: !!G.goals.steps[s.id], hint: G.goals.steps[s.id] ? null : (hints[s.id] || null) }));
  const done = G.tmp.goalSteps.filter((s) => s.done).length;
  G.tmp.goal = { n: ch.n, id: ch.id, name: ch.name, desc: ch.desc, target: ch.target, icon: ch.icon, done, total: ch.steps.length, reward: ch.reward, won: G.goals.won };
}

function refreshHints(G) {
  const ch = CHAPTERS[Math.min(CHAPTERS.length, G.goals.chapter) - 1];
  if (!ch) return;
  const hints = {};
  for (const s of ch.steps) if (!G.goals.steps[s.id]) hints[s.id] = resolveHint(G, s.hint);
  G.tmp.hints = hints;
}

// ---- chapters and victory --------------------------------------------------------------------
function giveReward(G, reward) {
  for (const [res, n] of Object.entries(reward || {})) gain(G, res, n, homeRoot(G));
}

function checkGoals(G) {
  const meta = ensureMeta(G);
  let guard = 0;
  while (!G.goals.won && guard++ < 10) {
    const ch = CHAPTERS[G.goals.chapter - 1];
    if (!ch) break;
    for (const s of ch.steps) {
      if (G.goals.steps[s.id]) continue;
      if (check(G, s.check)) {
        G.goals.steps[s.id] = true; meta.stepAt[s.id] = G.t;
        G.bus.emit('goal:step', { id: s.id, chapter: ch.n });
        G.tmp.hintT = 0;
      }
    }
    if (!ch.steps.every((s) => G.goals.steps[s.id])) break;
    // chapter complete
    if (!G.goals.done.includes(ch.id)) G.goals.done.push(ch.id);
    giveReward(G, ch.reward);
    G.bus.emit('goal:done', { id: ch.id });
    if (ch.n >= CHAPTERS.length) { victory(G); break; }
    G.goals.chapter = ch.n + 1;
    meta.chapterAt[G.goals.chapter] = G.t;
    const next = CHAPTERS[ch.n];
    G.bus.emit('chapter', { id: next.id, n: next.n, name: next.name, prev: ch.id });
    notify(G, `Chapter ${next.n}: ${next.name}`, 'good', next.icon || 'scroll');
    refreshHints(G);
  }
}

function victory(G) {
  if (G.goals.won) return;
  G.goals.won = true;
  G.goals.wonAt = G.t;
  G.goals.meta.wonDay = G.day;
  bump(G, 'wins');
  notify(G, 'The Skyforge burns again. The islands are safe.', 'good', 'skyforge');
  G.bus.emit('won', {});
}

// Cheat: win by the normal path (research, Glimmerreach, a five-stage Skyforge, the Dreadnought down).
export function win(G) {
  if (!G) return { ok: false, error: 'No colony' };
  if (G.goals.won) return { ok: true };
  research.unlock(G, 'all');
  const gl = islandById(G, 'glimmerreach');
  if (gl && !gl.owned) chart.doClaim(G, gl, 'cheat');
  let b = G.buildings.find((x) => x.type === 'skyforge');
  if (!b && gl) {
    let spot = null;
    try { const s = islands.spots(G, 'skyforge', gl.id); if (s && s.length) spot = s[0]; } catch (e) { /* stub */ }
    if (spot) {
      try {
        const big = { wood: 999, planks: 999, stone: 999, iron: 999, parts: 999, skystone: 999, aether: 999, coal: 999, coin: 99999 };
        const root = rootOf(G, gl.id);
        for (const [r, n] of Object.entries(big)) { if (economy.give) economy.give(G, r, n, root); else gain(G, r, n, root); }
        const res = islands.build(G, 'skyforge', gl.id, spot[0], spot[1]);
        if (res && res.ok) b = G.buildings.find((x) => x.id === res.id);
      } catch (e) { b = null; }
    }
    if (!b) {
      const k = (gl.cells || '').indexOf('x');
      const u = k >= 0 ? k % gl.w : Math.floor(gl.w / 2) - 1, v = k >= 0 ? Math.floor(k / gl.w) : Math.floor(gl.h / 2) - 1;
      b = { id: G.nextId++, type: 'skyforge', island: gl.id, u, v, level: 0, state: 'built', progress: 1, hp: 2000, maxHp: 2000, fire: 0, workers: 0, want: 0, on: true, eff: 1, stall: null, buf: {} };
      G.buildings.push(b);
      G.bus.emit('build:placed', { b });
    }
  }
  if (b) {
    if (b.state !== 'built') { b.state = 'built'; b.progress = 1; G.bus.emit('build:done', { b }); }
    b.level = SKYFORGE_STAGES.length; b.forge = null;
    G.bus.emit('build:upgraded', { b });
  }
  for (const ch of CHAPTERS) for (const s of ch.steps) G.goals.steps[s.id] = true;
  G.goals.flags.finalRaid = true;
  G.goals.flags.dreadnoughtDown = true;
  G.goals.flags.stormSurvived = true; G.goals.flags.raidSurvived = true;
  checkGoals(G);
  if (!G.goals.won) victory(G);
  G.tmp.skyforgeProgress = 1;
  refreshSteps(G);
  return { ok: true };
}

// ---- the Skyforge ---------------------------------------------------------------------------
export function forgeInfo(G, b = skyforge(G)) {
  if (!b) return null;
  const lvl = b.level || 0;
  const next = SKYFORGE_STAGES[lvl] || null;
  return {
    stage: lvl, stages: SKYFORGE_STAGES.length, next, forge: b.forge || null,
    progress: forgeProgress(G),
    missing: next ? missingOn(G, b.island, next.cost) : [],
    locked: next && next.needs && !research.has(G, next.needs) ? next.needs : null,
  };
}

export function forgeUpgrade(G, b) {
  if (!G || !b || b.type !== 'skyforge') return { ok: false, error: 'Not the Skyforge' };
  if (b.state !== 'built') return { ok: false, error: 'Finish the Skyforge foundations first' };
  const lvl = b.level || 0;
  if (lvl >= SKYFORGE_STAGES.length) return { ok: false, error: 'The Skyforge is complete' };
  if (b.forge) return { ok: false, error: `Stage ${b.forge.stage} is still being raised` };
  const st = SKYFORGE_STAGES[lvl];
  if (st.needs && !research.has(G, st.needs)) return { ok: false, error: `Stage ${st.n} needs ${research.BY_ID[st.needs].name}` };
  const miss = missingOn(G, b.island, st.cost);
  if (miss.length) return { ok: false, error: `Stage ${st.n} needs ${costText(st.cost)} in ${islandById(G, b.island)?.name || 'its'} stores`, missing: miss };
  if (!payOn(G, b.island, st.cost)) return { ok: false, error: 'Could not pay' };
  b.forge = { stage: st.n, t: 0, time: st.time };
  G.bus.emit('forge:stage', { b, stage: st.n });
  // the last stage lights the forge: the Crimson Gale's Dreadnought sees it coming
  if (st.n >= SKYFORGE_STAGES.length && !G.goals.flags.finalRaid && !G.goals.flags.dreadnoughtDown) startFinal(G);
  notify(G, `Raising the Skyforge: ${st.name}`, 'info', 'skyforge', { island: b.island, u: b.u, v: b.v });
  return { ok: true, id: b.id, stage: st.n };
}

function forgeProgress(G) {
  const b = skyforge(G);
  if (!b) return 0;
  const f = b.forge ? Math.min(1, b.forge.t / b.forge.time) : 0;
  return Math.min(1, ((b.level || 0) + f) / SKYFORGE_STAGES.length);
}

function stepForge(G, dt) {
  for (const b of G.buildings) {
    if (b.type !== 'skyforge' || !b.forge || b.state !== 'built') continue;
    const staff = b.want > 0 ? Math.max(C().forgeMinRate, Math.min(1, (b.workers || 0) / b.want)) : 1;
    const eff = b.eff != null && b.eff > 0 ? Math.max(staff, b.eff) : staff;
    const hurt = b.hp != null && b.maxHp ? (b.hp < b.maxHp * 0.5 ? 0.5 : 1) : 1;
    b.forge.t += dt * eff * hurt * (1 + research.bonus(G, 'buildSpeed'));
    if (b.forge.t >= b.forge.time) {
      const n = b.forge.stage;
      b.level = n; b.forge = null;
      G.bus.emit('build:upgraded', { b });
      G.bus.emit('forge:done', { b, stage: n });
      notify(G, `Skyforge stage ${n} complete: ${SKYFORGE_STAGES[n - 1].name}`, 'good', 'skyforge', { island: b.island, u: b.u, v: b.v });
    }
  }
}

// ---- the finale ---------------------------------------------------------------------------------
function startFinal(G) {
  const m = G.goals.meta;
  G.goals.flags.finalRaid = true;
  m.finalAt = G.t; m.finalRetryAt = null;
  if (raids.startFinal) raids.startFinal(G);
  else if (raids.startRaid) { raids.startRaid(G, 2.5, { final: true }); }
  else { G.goals.flags.dreadnoughtDown = true; } // no raids module (headless stub): the finale is skipped
}

function stepFinale(G) {
  const f = G.goals.flags, m = G.goals.meta;
  if (G.goals.won || f.dreadnoughtDown) return;
  const sf = skyforge(G);
  if (sf && (sf.level >= SKYFORGE_STAGES.length || (sf.forge && sf.forge.stage >= SKYFORGE_STAGES.length)) && !f.finalRaid) startFinal(G);
  if (!f.finalRaid) return;
  // fallback detection: a dreadnought we saw is gone with no hull left
  const d = G.pirates.find((p) => p.kind === 'dreadnought');
  if (d) { G.tmp.dread = d; if (d.hp <= 0) f.dreadnoughtDown = true; }
  else if (G.tmp.dread) {
    if (G.tmp.dread.hp <= 0 || G.tmp.dread.state === 'down' || G.tmp.dread.state === 'sinking') f.dreadnoughtDown = true;
    G.tmp.dread = null;
  }
  if (f.dreadnoughtDown) { notify(G, 'The Dreadnought falls burning into the clouds!', 'good', 'skull'); return; }
  // it got away: it comes back
  if (!G.raid && !d && G.t - (m.finalAt || 0) > 120) {
    if (m.finalRetryAt == null) { m.finalRetryAt = G.t + C().finalRetry * DAY; notify(G, 'The Dreadnought withdrew to lick its wounds. It will return.', 'warn', 'skull'); }
    else if (G.t >= m.finalRetryAt) startFinal(G);
  }
}

// ---- polls: storms, raids, fires, story beats ------------------------------------------------------
function poll(G) {
  const m = G.goals.meta, f = G.goals.flags;
  if (G.weather && G.weather.kind === 'storm') m.inStorm = true;
  else if (m.inStorm) { m.inStorm = false; if (!f.stormSurvived) f.stormSurvived = true; bump(G, 'storms'); }
  if (G.raid && G.raid.phase && G.raid.phase !== 'warn') m.inRaid = true;
  else if (!G.raid && m.inRaid) { m.inRaid = false; if (!f.raidSurvived) f.raidSurvived = true; bump(G, 'raids'); }
  if (G.buildings.some((b) => b.fire > 0)) m.lastFireDay = G.day;
  if ((G.colony.happiness || 0) >= 0.85) { if (m.happySince == null) m.happySince = G.t; } else m.happySince = null;
  // story beats for Storm Season: make sure a storm and a raid come
  if (G.goals.chapter === 5 && !G.goals.won) {
    const since = G.t - (m.chapterAt[5] ?? G.t);
    if (!f.stormSurvived && !m.inStorm && !f.storyStorm && since > C().storyStorm * DAY && weather.startStorm) { f.storyStorm = true; weather.startStorm(G, 0.6); }
    if (!f.raidSurvived && !m.inRaid && !G.raid && !f.storyRaid && since > C().storyRaid * DAY && raids.startRaid && !f.roostTaken) { f.storyRaid = true; raids.startRaid(G, 0.6); }
  }
  // temporary boosts expire
  if (G.colony.boosts && G.colony.boosts.length) G.colony.boosts = G.colony.boosts.filter((b) => b.until > G.t);
}

// ---- achievements ---------------------------------------------------------------------------------
function achieved(G, c) {
  const T = G.stats.totals || {}, m = G.goals.meta;
  if (c.pop != null) return (G.colony.pop || 0) >= c.pop;
  if (c.owned != null) return owned(G).length >= c.owned;
  if (c.allIslands) return G.islands.length > 0 && G.islands.every((i) => i.owned);
  if (c.researched != null) return G.research.done.length >= c.researched;
  if (c.allResearch) return RESEARCH.every((r) => G.research.done.includes(r.id));
  if (c.day != null) return G.day >= c.day;
  if (c.noFireDays != null) return G.day - (m.lastFireDay ?? 1) >= c.noFireDays;
  if (c.tradeCoin != null) return (T.tradeCoin || 0) >= c.tradeCoin;
  if (c.contracts != null) return (T.contracts || 0) >= c.contracts;
  if (c.raids != null) return (T.raids || 0) >= c.raids;
  if (c.storms != null) return (T.storms || 0) >= c.storms;
  if (c.won) return !!G.goals.won;
  if (c.wonBy != null) return !!G.goals.won && (m.wonDay ?? G.day) <= c.wonBy;
  if (c.chapter != null) return G.goals.chapter >= c.chapter || G.goals.won;
  if (c.ships != null) return G.ships.filter((s) => s.state !== 'building').length >= c.ships;
  if (c.routes != null) return G.routes.length >= c.routes;
  if (c.buildings != null) return G.buildings.filter((b) => b.state === 'built').length >= c.buildings;
  if (c.happyDays != null) return m.happySince != null && G.t - m.happySince >= c.happyDays * DAY;
  if (c.roost) return !!G.goals.flags.roostTaken;
  if (c.drifted != null) return (T.drifted || 0) >= c.drifted;
  if (c.events != null) return (T.events || 0) >= c.events;
  if (c.allRep != null) return G.ports.length > 0 && G.ports.every((p) => p.rep >= c.allRep);
  if (c.coinHeld != null) return (G.colony.coin || 0) >= c.coinHeld;
  if (c.stock) return Object.entries(c.stock).every(([r, n]) => anyStock(G, r) >= n);
  if (c.skyforge != null) return forgeStage(G) >= c.skyforge;
  return false;
}

function checkAchievements(G) {
  for (const a of ACHIEVEMENTS) {
    if (G.goals.achievements.includes(a.id)) continue;
    if (achieved(G, a.check)) {
      G.goals.achievements.push(a.id);
      G.bus.emit('achievement', { id: a.id, name: a.name });
      notify(G, `Achievement: ${a.name}`, 'good', a.icon || 'star');
    }
  }
}

// ---- event cards ----------------------------------------------------------------------------------
function eligible(G, e) {
  const n = e.needs || {}, m = G.goals.meta;
  if (e.once && m.seen[e.id] != null) return false;
  if (m.seen[e.id] != null && G.day - m.seen[e.id] < (e.cooldown || 5)) return false;
  if (n.day != null && G.day < n.day) return false;
  if (n.chapter != null && G.goals.chapter < n.chapter) return false;
  if (n.building && !builtCount(G, n.building)) return false;
  if (n.research && !G.research.done.includes(n.research)) return false;
  if (n.pop != null && (G.colony.pop || 0) < n.pop) return false;
  if (n.notFlag && G.goals.flags[n.notFlag]) return false;
  return true;
}

function optionOk(G, o) { return !o.cost || missing(G, o.cost, homeRoot(G)).length === 0; }

export function showEvent(G, id) {
  const e = EV[id]; if (!e) return { ok: false, error: `Unknown event ${id}` };
  G.event = {
    id: e.id, title: e.title, text: e.text, art: e.art || null, at: G.t,
    options: e.options.map((o) => ({ label: o.label, desc: o.desc || '', cost: o.cost || null, ok: optionOk(G, o) })),
  };
  G.goals.meta.seen[e.id] = G.day;
  G.bus.emit('event', { event: G.event });
  return { ok: true, id };
}

function rollEvent(G) {
  const m = G.goals.meta, [a, b] = C().eventEvery;
  if (G.t < m.nextEvent || G.event) return;
  if (G.raid || (G.weather && G.weather.kind === 'storm') || G.colony.pop < 4) { m.nextEvent = G.t + 60; return; }
  const list = EVENTS.filter((e) => eligible(G, e));
  m.nextEvent = G.t + G.rng.events.range(a, b) * DAY;
  if (!list.length) return;
  const e = G.rng.events.weighted(list, (x) => x.weight || 1);
  showEvent(G, e.id);
}

function applyEffects(G, eff, out) {
  if (!eff) return;
  const root = homeRoot(G);
  if (eff.coin) gain(G, 'coin', eff.coin, root);
  if (eff.insight) gain(G, 'insight', eff.insight, root);
  if (eff.res) for (const [r, n] of Object.entries(eff.res)) { if (economy.give && n > 0) economy.give(G, r, n, root); else gain(G, r, n, root); }
  if (eff.pop) { G.colony.pop = Math.max(0, (G.colony.pop || 0) + eff.pop); G.bus.emit(eff.pop > 0 ? 'pop:arrive' : 'pop:leave', { n: Math.abs(eff.pop) }); }
  for (const k of ['happiness', 'production', 'growth']) {
    if (!eff[k]) continue;
    G.colony.boosts = G.colony.boosts || [];
    G.colony.boosts.push({ kind: k, v: eff[k].v, until: G.t + (eff[k].days || 1) * DAY });
  }
  if (eff.rep) trade.addReputation(G, eff.rep.port ?? null, eff.rep.n);
  if (eff.raid && raids.startRaid && !G.goals.flags.roostTaken) raids.startRaid(G, eff.raid);
  if (eff.storm && weather.startStorm) weather.startStorm(G, eff.storm);
  if (eff.fire) {
    const list = G.buildings.filter((b) => b.state === 'built' && b.type !== 'skyforge' && !(b.fire > 0));
    for (let k = 0; k < eff.fire && list.length; k++) {
      const b = list.splice(G.rng.events.int(0, list.length - 1), 1)[0];
      b.fire = Math.max(b.fire || 0, 0.3);
      G.bus.emit('fire:start', { b });
    }
  }
  if (eff.discover) for (let k = 0; k < eff.discover; k++) chart.discoverOne(G);
  if (eff.research) {
    if (G.research.current) G.research.progress = Math.min(0.999, G.research.progress + eff.research);
    else gain(G, 'insight', 60, root);
  }
  if (eff.flag) G.goals.flags[eff.flag] = true;
  if (eff.text) out.text = eff.text;
  if (eff.chance) applyEffects(G, G.rng.events.chance(eff.chance.p) ? eff.chance.win : eff.chance.lose, out);
}

export function choose(G, i) {
  if (!G) return { ok: false, error: 'No colony' };
  if (!G.event) return { ok: false, error: 'No choice to make' };
  const e = EV[G.event.id];
  if (!e) { G.event = null; return { ok: false, error: 'Unknown event' }; }
  const o = e.options[i | 0];
  if (!o) return { ok: false, error: 'No such option' };
  if (o.cost) {
    const miss = missing(G, o.cost, homeRoot(G));
    if (miss.length) return { ok: false, error: `Not enough ${miss.map((m) => m.res).join(', ')}` };
    pay(G, o.cost, homeRoot(G));
  }
  const out = { text: '' };
  applyEffects(G, o.effects, out);
  const id = G.event.id;
  G.event = null;
  bump(G, 'events');
  G.bus.emit('event:resolved', { id, choice: i | 0, text: out.text });
  if (out.text) notify(G, out.text, 'info', e.art || 'scroll');
  return { ok: true, id, text: out.text };
}

// ---- the colony chronicle (G.stats.samples, read by ui/stats.js) -------------------------------------
function sample(G) {
  const S = G.stats.samples || (G.stats.samples = []);
  const home = homeRoot(G);
  const rates = (G.tmp.rates && G.tmp.rates[home]) || {};
  const res = (G.pools[home] && G.pools[home].res) || {};
  const prod = {}, stock = {};
  for (const [k, v] of Object.entries(rates)) prod[k] = Math.round(v * 10) / 10;
  for (const [k, v] of Object.entries(res)) stock[k] = Math.round(v);
  S.push({
    t: Math.round(G.t), day: G.day, pop: Math.round(G.colony.pop || 0), popCap: G.colony.popCap || 0,
    coin: Math.round(G.colony.coin || 0), insight: Math.round(G.colony.insight || 0),
    happiness: Math.round((G.colony.happiness || 0) * 100) / 100, prod, stock,
    islands: owned(G).length, buildings: G.buildings.filter((b) => b.state === 'built').length, ships: G.ships.length, chapter: G.goals.chapter,
  });
  // keep at most ~720: thin the older half 2:1
  if (S.length > 720) { const half = S.splice(0, 360); G.stats.samples = half.filter((x, i) => i % 2 === 0).concat(S); }
}

// ---- step -------------------------------------------------------------------------------------------
export function step(G, dt) {
  stepForge(G, dt);
  stepFinale(G);
  G.tmp.goalT = (G.tmp.goalT || 0) - dt;
  if (G.tmp.goalT <= 0) {
    G.tmp.goalT = C().hintEvery;
    poll(G);
    checkGoals(G);
    if (G.tmp.hintT <= 0) { refreshHints(G); G.tmp.hintT = 5; }
    G.tmp.hintT -= C().hintEvery;
    refreshSteps(G);
    G.tmp.achT = (G.tmp.achT || 0) - C().hintEvery;
    if (G.tmp.achT <= 0) { G.tmp.achT = 2; checkAchievements(G); }
    rollEvent(G);
  }
  if (G.t >= (G.goals.meta.nextSample ?? 0)) { G.goals.meta.nextSample = Math.floor(G.t / 60) * 60 + 60; sample(G); }
  G.tmp.skyforgeProgress = forgeProgress(G);
}

