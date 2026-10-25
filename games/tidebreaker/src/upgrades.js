// Tidebreaker: the upgrade cards ("Blessings of the Tide") and the stats they
// build. computeStats(run, meta) starts from BASE_STATS (config.js), adds the
// Shipwright's meta upgrades (save.js META) and then every card at its rank;
// combat, ships and kraken read only the result (G.stats).
//
// A card: { id, name, rarity, max, desc(rank) -> [lines], chips(rank) -> [chips],
//   art (cards.js cardArt kind), requires: [ids] (a combo), combo, apply(stats, rank) }
// desc and chips take the rank the card would reach if picked, so the card
// screen shows what the next rank gives.
import { BASE_STATS, LEGS } from './config.js';
import { META } from './save.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const lines = (...l) => () => l;

export const RARITY = {
  common:    { label: 'COMMON',    col: '#9fb8d8', weight: 52 },
  rare:      { label: 'RARE',      col: '#4fa8ff', weight: 30 },
  epic:      { label: 'EPIC',      col: '#c66aff', weight: 14 },
  legendary: { label: 'LEGENDARY', col: '#ffb22a', weight: 9 },
};
export const ABILITIES = ['chain', 'fire', 'lightning', 'kraken'];

const list = [
  // ---------------------------------------------------------------- abilities
  { id: 'chain', name: 'Chain Shot', rarity: 'rare', max: 3, art: 'chain',
    desc: (r) => r === 1 ? ['Paired balls on a chain', 'shred sails and slow ships.'] : ['Heavier chain, longer drag.', 'Q comes back sooner.'],
    chips: (r) => r === 1 ? ['UNLOCKS Q', 'SLOW 40%'] : [`x${(2.5 + 0.75 * (r - 1)).toFixed(2).replace(/0$/, '')} DMG`, `SLOW ${pct(0.4 + 0.1 * (r - 1))}`],
    apply(s, r) { s.chain = r; s.chainDmg += 0.75 * (r - 1); s.chainSlow += 0.1 * (r - 1); s.slowTime += 1 * (r - 1); s.cdChain -= 1.2 * (r - 1); } },
  { id: 'fire', name: 'Fire Barrels', rarity: 'epic', max: 3, art: 'fire',
    desc: (r) => r === 1 ? ['Lob burning barrels at the', 'enemy. Pirates ignite.'] : ['More barrels, hotter pitch.', 'E comes back sooner.'],
    chips: (r) => r === 1 ? ['UNLOCKS E', 'BURN 6s'] : [`${3 + (r - 1)} BARRELS`, `${6 + 4 * (r - 1)} DPS`],
    apply(s, r) { s.fire = r; s.barrels += r - 1; s.burnDps += 4 * (r - 1); s.burnTime += r - 1; s.cdFire -= 1.5 * (r - 1); } },
  { id: 'lightning', name: 'Lightning Masts', rarity: 'legendary', max: 3, art: 'bolt',
    desc: (r) => r === 1 ? ['Storms charge your masts.', 'Bolts chain to 3 ships.'] : ['Copper in the rigging:', 'more links, harder strikes.'],
    chips: (r) => r === 1 ? ['CHAIN x3', 'STORM x2'] : [`CHAIN x${3 + (r - 1)}`, `${40 + 18 * (r - 1)} DMG`],
    apply(s, r) { s.lightning = r; s.lightningTargets += r - 1; s.lightningDmg += 18 * (r - 1); s.cdLightning -= 1.5 * (r - 1); } },
  { id: 'kraken', name: 'Kraken Ally', rarity: 'legendary', max: 3, art: 'kraken',
    desc: (r) => r === 1 ? ['Call a tentacle from the', 'deep to crush a ship.'] : ['The deep answers louder:', 'another arm rises.'],
    chips: (r) => r === 1 ? ['UNLOCKS F', `${30} DPS`] : [`${1 + (r - 1)} TENTACLES`, `${30 + 12 * (r - 1)} DPS`],
    apply(s, r) { s.kraken = r; s.krakenTentacles += r - 1; s.krakenDmg += 15 * (r - 1); s.cdKraken -= 3 * (r - 1); } },

  // ---------------------------------------------------------------- guns
  { id: 'heavy', name: 'Heavy Shot', rarity: 'common', max: 5, art: 'heavy',
    desc: lines('Twelve-pound iron where', 'there was nine.'), chips: () => ['+22% DMG'],
    apply(s, r) { s.dmg *= 1 + 0.22 * r; } },
  { id: 'cannons', name: 'Extra Cannons', rarity: 'rare', max: 3, art: 'cannons',
    desc: lines('Another gun run out', 'on the broadside deck.'), chips: () => ['+1 GUN'],
    apply(s, r) { s.guns += r; } },
  { id: 'reload', name: 'Quick Reload', rarity: 'common', max: 4, art: 'reload',
    desc: lines('Drilled powder monkeys', 'keep the guns hot.'), chips: () => ['-12% RELOAD'],
    apply(s, r) { s.reload *= Math.pow(0.88, r); } },
  { id: 'grapeshot', name: 'Grapeshot', rarity: 'rare', max: 3, art: 'grapeshot',
    desc: lines('Bags of shot scatter', 'wide over the waves.'), chips: () => ['+2 BALLS', 'WIDER SPREAD'],
    apply(s, r) { s.guns += 2 * r; s.dmg *= Math.pow(0.9, r); s.spread += 14 * r; } },
  { id: 'gunners', name: 'Crack Gunners', rarity: 'common', max: 4, art: 'gunners',
    desc: lines('Old hands who know', 'where a hull is thin.'), chips: () => ['+7% CRIT', '+25% CRIT DMG'],
    apply(s, r) { s.crit += 0.07 * r; s.critMul += 0.25 * r; } },
  { id: 'explosive', name: 'Explosive Shells', rarity: 'rare', max: 3, art: 'explosive',
    desc: lines('Hollow shot packed with', 'powder bursts on impact.'), chips: (r) => [`SPLASH ${40 + 20 * (r - 1)}`, '+8% DMG'],
    apply(s, r) { s.splash = Math.max(s.splash, 40 + 20 * (r - 1)); s.dmg *= 1 + 0.08 * r; } },
  { id: 'longnines', name: 'Long Nines', rarity: 'common', max: 3, art: 'longnines',
    desc: (r) => r < 3 ? ['Long-barrelled chasers:', 'faster, truer shot.'] : ['Long-barrelled chasers', 'punch clean through.'],
    chips: (r) => r < 3 ? ['+20% SHOT SPEED', 'TIGHTER'] : ['+20% SHOT SPEED', 'PIERCE +1'],
    apply(s, r) { s.shotSpeed *= 1 + 0.2 * r; s.spread = Math.max(4, s.spread - 4 * r); if (r >= 3) s.pierce += 1; } },

  // ---------------------------------------------------------------- the ship
  { id: 'hull', name: 'Copper-bottomed Hull', rarity: 'common', max: 5, art: 'hull',
    desc: lines('Copper sheathing and', 'fresh oak planking.'), chips: () => ['+45 HULL'],
    apply(s, r) { s.maxHull += 60 * r; } },
  { id: 'surgeon', name: "Ship's Surgeon", rarity: 'rare', max: 3, art: 'surgeon',
    desc: lines('Patches crew and hull', 'between the volleys.'), chips: () => ['+1.5 HULL/s'],
    apply(s, r) { s.regen += 2.5 * r; } },
  { id: 'armor', name: 'Iron Plating', rarity: 'rare', max: 3, art: 'armor',
    desc: lines('Riveted iron along', 'the waterline.'), chips: () => ['-10% DMG TAKEN'],
    apply(s, r) { s.armor = Math.min(0.6, s.armor + 0.12 * r); } },
  { id: 'rigging', name: 'Swift Rigging', rarity: 'common', max: 3, art: 'rigging',
    desc: lines('Taut lines and new', 'canvas catch every gust.'), chips: () => ['+15% SPEED'],
    apply(s, r) { s.speed *= 1 + 0.15 * r; } },
  { id: 'doubloons', name: 'Lucky Doubloons', rarity: 'common', max: 3, art: 'doubloons',
    desc: lines('Pirate purses seem to', 'grow heavier.'), chips: () => ['+30% GOLD'],
    apply(s, r) { s.goldMul += 0.3 * r; } },
  { id: 'repair', name: "Carpenter's Repair", rarity: 'common', max: 99, art: 'repair', once: true,
    desc: lines('Hammer, nails and tar:', 'mend the Gull now.'), chips: () => ['HEAL 50%'],
    apply() {} },
  { id: 'fourth', name: 'Fourth Card', rarity: 'epic', max: 1, art: 'fourth',
    desc: lines('The tide is generous:', 'one more blessing offered.'), chips: () => ['+1 CARD'],
    apply(s) { s.cards += 1; } },

  // ---------------------------------------------------------------- combos
  { id: 'thunderfire', name: 'Thunderfire', rarity: 'legendary', max: 1, art: 'thunderfire', combo: true, requires: ['lightning', 'fire'],
    desc: lines('Every bolt sets its', 'targets ablaze.'), chips: () => ['LIGHTNING IGNITES'],
    apply(s) { s.lightningIgnites = 1; } },
  { id: 'hellfire', name: 'Hellfire Broadside', rarity: 'epic', max: 1, art: 'hellfire', combo: true, requires: ['fire', 'cannons'],
    desc: lines('Pitch-soaked wadding:', 'every ball burns.'), chips: () => ['BROADSIDE BURNS'],
    apply(s) { s.broadsideBurn = 1; s.burn = Math.max(s.burn, 5); } },
  { id: 'stormgunners', name: 'Storm Gunners', rarity: 'epic', max: 1, art: 'stormgunners', combo: true, requires: ['lightning', 'gunners'],
    desc: lines('Crits crackle with', 'arcs of lightning.'), chips: () => ['CRITS ARC x2'],
    apply(s) { s.critArc = 2; } },
  { id: 'skipping', name: 'Skipping Stones', rarity: 'epic', max: 2, art: 'skipping', combo: true, requires: ['grapeshot', 'longnines'],
    desc: lines('Missed shot skips off', 'the swell and flies on.'), chips: (r) => [`SKIP x${r}`],
    apply(s, r) { s.skip = r; } },
  { id: 'abyssal', name: 'Abyssal Grip', rarity: 'legendary', max: 1, art: 'abyssal', combo: true, requires: ['kraken', 'chain'],
    desc: lines('The kraken chains what', 'it holds. They break.'), chips: () => ['HELD: SLOWED', '+50% DMG'],
    apply(s) { s.krakenSlow = 0.5; } },
];
export const UPGRADES = Object.fromEntries(list.map((u) => [u.id, u]));
export const COMBOS = list.filter((u) => u.combo).map((u) => u.id);

// The words on a card for the rank it would reach.
export function cardText(id, rank) {
  const u = UPGRADES[id];
  return { desc: u.desc(rank), chips: u.chips(rank) };
}

// Stats for a run: BASE_STATS + meta + cards.
export function computeStats(run, meta) {
  const s = { ...BASE_STATS };
  const mu = meta?.upgrades || {};
  for (const m of META) if (mu[m.id]) m.apply(s, Math.min(mu[m.id], m.costs.length));
  // one-off start bonuses from the Shipwright (applied the first time a run's stats are built)
  if (run && !run.metaStart) {
    run.metaStart = true;
    if (mu.maps) run.gold += 60 * mu.maps;
    if (mu.veteran && !run.picks.length) {
      const commons = list.filter((u) => u.rarity === 'common' && !u.once).map((u) => u.id);
      let h = (meta.runs || 0) * 2654435761 + mu.veteran * 97;
      for (let i = 0; i < mu.veteran; i++) {
        h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
        const id = commons[h % commons.length];
        run.upgrades[id] = (run.upgrades[id] || 0) + 1; run.picks.push(id);
      }
    }
  }
  for (const [id, rank] of Object.entries(run?.upgrades || {})) {
    const u = UPGRADES[id];
    if (u && rank > 0) u.apply(s, Math.min(rank, u.max));
  }
  s.cdChain = Math.max(3, s.cdChain); s.cdFire = Math.max(4, s.cdFire);
  s.cdLightning = Math.max(5, s.cdLightning); s.cdKraken = Math.max(10, s.cdKraken);
  s.reload = Math.max(0.45, s.reload);
  s.crit = Math.min(0.75, s.crit);
  s.cards = Math.min(4, s.cards);
  s.rerollCost = Math.max(10, s.rerollCost);
  return s;
}

const ownedAll = (G, ids) => ids.every((id) => (G.run.upgrades[id] || 0) > 0);
// Can this card be offered now?
export function offerable(G, id) {
  const u = UPGRADES[id], r = G.run?.upgrades[id] || 0;
  if (r >= u.max) return false;
  if (u.requires && !ownedAll(G, u.requires)) return false;
  if (id === 'repair' && G.player && G.player.hp >= G.player.maxHp * 0.9) return false;
  return true;
}

// n distinct cards by rarity weight. Combos whose parts are owned get a boost
// so builds come together; late in the voyage ability cards weigh a bit more.
export function rollCards(G, n = 3) {
  const pool = list.filter((u) => offerable(G, u.id));
  const late = (G.stage || 0) / (LEGS.length * 3);
  const weight = (u) => {
    let w = RARITY[u.rarity].weight;
    if (u.combo) w *= 2.2;
    if (ABILITIES.includes(u.id) && !(G.run.upgrades[u.id] > 0)) w *= 2 + 2 * late;
    if (u.id === 'repair' && G.player) w *= 0.6 + 2 * (1 - G.player.hp / G.player.maxHp);
    return w;
  };
  const out = [];
  // from the second screen on, a captain with no ability is always offered one
  if ((G.stage || 0) >= 1 && !ABILITIES.some((id) => G.run.upgrades[id] > 0)) {
    const ab = pool.filter((u) => ABILITIES.includes(u.id));
    if (ab.length) { const u = ab[(G.rng() * ab.length) | 0]; out.push(u.id); pool.splice(pool.indexOf(u), 1); }
  }
  while (out.length < n && pool.length) {
    let tot = 0; for (const u of pool) tot += weight(u);
    let r = G.rng() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= weight(pool[k]); if (r <= 0) break; }
    out.push(pool[k].id); pool.splice(k, 1);
  }
  // shuffle so a guaranteed ability is not always the first card
  for (let i = out.length - 1; i > 0; i--) { const j = (G.rng() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// Take a card: one rank up. One-off effects act on the ship now.
export function applyUpgrade(G, id) {
  const u = UPGRADES[id];
  if (!u || !G.run) return false;
  const r = G.run.upgrades[id] || 0;
  if (r >= u.max) return false;
  G.run.upgrades[id] = r + 1;
  G.run.picks.push(id);
  if (id === 'repair' && G.player) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.5);
  return true;
}
