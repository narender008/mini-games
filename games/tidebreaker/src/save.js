// Tidebreaker: saved progress. Renown earned on every voyage buys permanent
// upgrades at the Shipwright (META); records keep the best voyage. Stored
// through config.js `store` (localStorage, and nothing is written in ?debug).
import { store, LEGS } from './config.js';

// Permanent upgrades. costs[i] is the price of rank i + 1.
export const META = [
  { id: 'hull', name: 'Reinforced Hull', icon: 'hull', costs: [60, 120, 200, 300, 450],
    desc: 'Oak ribs doubled: more hull every voyage.', per: '+20 HULL', apply(s, r) { s.maxHull += 20 * r; } },
  { id: 'gunners', name: 'Master Gunners', icon: 'cannon', costs: [80, 160, 260, 400, 600],
    desc: 'Veterans of a hundred broadsides.', per: '+6% DMG', apply(s, r) { s.dmg *= 1 + 0.06 * r; } },
  { id: 'maps', name: 'Treasure Maps', icon: 'map', costs: [50, 100, 180, 280],
    desc: 'Buried caches along the route.', per: '+60 START GOLD', apply() {} },
  { id: 'charm', name: 'Lucky Charm', icon: 'charm', costs: [60, 140, 240],
    desc: 'A lucky cat on the capstan.', per: '-10 REROLL COST', apply(s, r) { s.rerollCost -= 10 * r; } },
  { id: 'veteran', name: 'Veteran Crew', icon: 'crew', costs: [150, 350],
    desc: 'Sail with a hand who knows a trick.', per: '+1 START CARD', apply() {} },
  { id: 'figurehead', name: 'Figurehead of the Tide', icon: 'figurehead', costs: [120, 260, 500],
    desc: 'The sea favours a fair face.', per: '+10% GOLD · RANK 3: +1 CARD',
    apply(s, r) { s.goldMul += 0.1 * Math.min(r, 2); if (r >= 3) s.cards += 1; } },
];
export const META_BY_ID = Object.fromEntries(META.map((m) => [m.id, m]));

const blank = () => ({ renown: 0, earned: 0, upgrades: {}, best: { stage: 0, score: 0, wins: 0, fastest: 0 }, runs: 0 });

export function loadMeta() {
  const m = store.get('meta', null);
  const b = blank();
  if (!m || typeof m !== 'object') return b;
  return { ...b, ...m, upgrades: { ...(m.upgrades || {}) }, best: { ...b.best, ...(m.best || {}) } };
}
function saveMeta(meta) { store.set('meta', meta); }

export function metaCost(meta, id) {
  const m = META_BY_ID[id]; if (!m) return null;
  const r = meta.upgrades[id] || 0;
  return r >= m.costs.length ? null : m.costs[r];
}

// Bosses beaten so far: set-piece nodes before the current stage (+ the last on a win).
export function bossesBeaten(G, won) {
  let n = 0;
  LEGS.forEach((L, li) => L.nodes.forEach((t, ni) => { const st = li * 3 + ni; if (t !== 'fleet' && (st < G.stage || (won && st === G.stage))) n++; }));
  return n;
}

// End of a voyage: renown, records, save. Returns what the end screen shows.
export function recordRun(G, won) {
  const meta = G.meta, run = G.run || { score: 0, kills: 0 };
  const stage = won ? LEGS.length * 3 : G.stage;   // nodes cleared
  const bosses = bossesBeaten(G, won);
  const parts = { stage: stage * 10, kills: Math.round(run.kills * 1.5), bosses: bosses * 40, win: won ? 250 : 0 };
  const renown = parts.stage + parts.kills + parts.bosses + parts.win;
  const score = Math.round(run.score || 0);
  const time = G.t;
  const prev = { ...meta.best };
  meta.renown += renown; meta.earned = (meta.earned || 0) + renown; meta.runs++;
  const newBest = stage > prev.stage || (stage === prev.stage && score > prev.score);
  meta.best.stage = Math.max(prev.stage, stage);
  meta.best.score = Math.max(prev.score, score);
  let fastest = false;
  if (won) {
    meta.best.wins++;
    if (!prev.fastest || time < prev.fastest) { meta.best.fastest = time; fastest = true; }
  }
  saveMeta(meta);
  return { won, renown, parts, best: { ...meta.best }, newBest, fastest, stage, bosses, score, kills: run.kills || 0, gold: Math.round(run.gold || 0), time, picks: [...(run.picks || [])] };
}

// Buy one rank of a Shipwright upgrade with renown.
export function buyMeta(G, id) {
  const meta = G.meta, cost = metaCost(meta, id);
  if (cost == null || meta.renown < cost) return false;
  meta.renown -= cost;
  meta.upgrades[id] = (meta.upgrades[id] || 0) + 1;
  saveMeta(meta);
  G.ui.bought = { id, t: G.vt };
  return true;
}
