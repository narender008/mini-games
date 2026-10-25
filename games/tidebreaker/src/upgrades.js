// STUB (meta agent replaces): upgrade cards.
import { BASE_STATS } from './config.js';
export const UPGRADES = { heavy: { id: 'heavy', name: 'Heavy Shot', rarity: 'common', max: 5 } };
export function computeStats(run, meta) { return { ...BASE_STATS }; }
export function rollCards(G, n) { return ['heavy', 'heavy', 'heavy'].slice(0, n); }
export function applyUpgrade(G, id) { G.run.upgrades[id] = (G.run.upgrades[id] || 0) + 1; G.run.picks.push(id); }
