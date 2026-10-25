// The Tapestry: permanent upgrades woven in the Loomhall with Lumen (some rows also
// need Silk Keys to unlock). meta.tapestry = { rowId: rank }. Data only.
//
// TAPESTRY = [ { id, name, text ({v} = this rank's total), icon, color, max, costs: [lumen per rank],
//   unlockKeys (Silk Keys to open the row, once), per: value added per rank, apply(m, v) } ]
// tapestryMods(meta) -> the summed modifiers m. Stat fields are folded into G.hero.stats by
// heroStats (src/sim/boons.js); run.js reads the run-setup ones:
//   m.maxHp, m.dmg, m.speed, m.callStart (0..1 gauge at run start), m.deathDefiance,
//   m.rerolls (tokens per run), m.lumenMult, m.startGlint, m.rarityBonus, m.offerExtra (4th card),
//   m.knotBonus (chance a Knot gives +2 levels), m.healAfter (heal per chamber cleared), m.ward
// tapestryCost(meta, id) -> { lumen, keys } for the next rank, or null when maxed.

export const TAPESTRY = [
  { id: 'vigor', name: 'Hearthread', icon: 'heart', color: '#ff6d86', max: 5, per: 10, costs: [20, 40, 70, 110, 160],
    text: '+{v} max health.', apply(m, v) { m.maxHp += v; } },
  { id: 'defiance', name: 'Second Spool', icon: 'spool', color: '#ffd27a', max: 3, per: 1, costs: [120, 300, 600], unlockKeys: 1,
    text: 'When you fall, the golden thread holds: rise again {v} time(s) per run with half your health.', apply(m, v) { m.deathDefiance += v; } },
  { id: 'unpick', name: 'Unpicking', icon: 'needle', color: '#c7a6ff', max: 3, per: 1, costs: [50, 120, 240],
    text: '{v} reroll token(s) each run, to unpick the boons offered and draw again.', apply(m, v) { m.rerolls += v; } },
  { id: 'gleaning', name: 'Gleaning', icon: 'lumen', color: '#fff1c4', max: 5, per: 0.1, costs: [30, 55, 90, 140, 200],
    text: 'Gather {v%} more Lumen.', apply(m, v) { m.lumenMult += v; } },
  { id: 'brightweft', name: 'Bright Weft', icon: 'star', color: '#6fb8ff', max: 4, per: 0.05, costs: [60, 110, 180, 270],
    text: 'Boons are {v%} more likely to be Rare or better.', apply(m, v) { m.rarityBonus += v; } },
  { id: 'keen', name: 'Keen Thread', icon: 'blade', color: '#ffb347', max: 5, per: 0.03, costs: [40, 70, 110, 160, 220],
    text: 'You deal {v%} more damage.', apply(m, v) { m.dmg += v; } },
  { id: 'swift', name: 'Swift Shuttle', icon: 'wing', color: '#8ff5b0', max: 3, per: 0.03, costs: [40, 80, 140],
    text: 'Move {v%} faster.', apply(m, v) { m.speed += v; } },
  { id: 'patience', name: 'Patient Hands', icon: 'call', color: '#ffc35a', max: 4, per: 0.25, costs: [50, 90, 140, 200],
    text: 'Begin every run and region with your Call gauge {v%} full.', apply(m, v) { m.callStart += v; } },
  { id: 'thimble', name: 'Thimble Guard', icon: 'shield', color: '#d8a46a', max: 4, per: 8, costs: [50, 90, 140, 200], unlockKeys: 1,
    text: 'Begin each chamber with a Ward of {v}.', apply(m, v) { m.ward += v; } },
  { id: 'purse', name: 'Pell\'s Purse', icon: 'button', color: '#ff9a3a', max: 4, per: 30, costs: [30, 60, 100, 150],
    text: 'Begin each run with {v} Glint.', apply(m, v) { m.startGlint += v; } },
  { id: 'fourth', name: 'Fourth Thread', icon: 'card', color: '#b48cff', max: 1, per: 1, costs: [400], unlockKeys: 2,
    text: 'Boon offers show a fourth choice.', apply(m, v) { m.offerExtra += v; } },
  { id: 'knotwork', name: 'Knotwork', icon: 'knot', color: '#8ff5d0', max: 3, per: 0.2, costs: [80, 160, 260], unlockKeys: 1,
    text: 'Knots have a {v%} chance to tie two levels at once.', apply(m, v) { m.knotBonus += v; } },
  { id: 'mending', name: 'Mending Weft', icon: 'heal', color: '#9fd8ff', max: 3, per: 2, costs: [60, 120, 200],
    text: 'Clearing a chamber restores {v} health.', apply(m, v) { m.healAfter += v; } },
];

export const TAPESTRY_BY_ID = Object.fromEntries(TAPESTRY.map((r) => [r.id, r]));

export function tapestryMods(meta) {
  const m = { maxHp: 0, dmg: 0, speed: 0, callStart: 0, deathDefiance: 0, rerolls: 0, lumenMult: 1, startGlint: 0, rarityBonus: 0, offerExtra: 0, knotBonus: 0, healAfter: 0, ward: 0 };
  const t = (meta && meta.tapestry) || {};
  for (const row of TAPESTRY) {
    const rank = Math.max(0, Math.min(row.max, t[row.id] | 0));
    if (rank) row.apply(m, row.per * rank);
  }
  m.callStart = Math.min(1, m.callStart);
  return m;
}
export function tapestryText(id, rank) {
  const row = TAPESTRY_BY_ID[id]; if (!row) return '';
  const v = row.per * Math.max(1, rank);
  return row.text.replace('{v%}', Math.round(v * 100) + '%').replace('{v}', String(Math.round(v * 100) / 100));
}
export function tapestryCost(meta, id) {
  const row = TAPESTRY_BY_ID[id]; if (!row) return null;
  const rank = ((meta && meta.tapestry) || {})[id] | 0;
  if (rank >= row.max) return null;
  const opened = ((meta && meta.tapestryOpen) || []).includes(id);
  return { lumen: row.costs[rank], keys: rank === 0 && row.unlockKeys && !opened ? row.unlockKeys : 0, rank: rank + 1 };
}
