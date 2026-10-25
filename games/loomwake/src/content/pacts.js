// Fraying pacts: opt-in difficulty after the first clear (meta.unlocks.pacts). Each pact
// has ranks; each rank adds Fray (heat). Higher total Fray raises rewards (Lumen and
// Silk Key bounty on a clear, see frayReward). meta.pacts = { pactId: rank }. Data only.
//
// pactMods(pacts) -> m, read by the enemies/bosses/run helpers:
//   m.foeHp (mult), m.foeDmg (mult), m.foeSpeed (mult), m.eliteChance (+ chance a wave foe is elite),
//   m.bossArmor (mult on boss armour), m.bossPhaseFast (bosses enter phase 2 at +x of max hp),
//   m.healMult (mult on all hero healing), m.offerCount (-cards on boon offers),
//   m.deathDefianceOff (true = Tapestry death defiance disabled), m.timeLimit (s per region, 0 = none),
//   m.hazardDmg (mult), m.extraWave (int, extra waves per combat chamber), m.fray (total heat)

export const PACTS = [
  { id: 'hardened', name: 'Hardened Thread', icon: 'shield', max: 3, fray: [1, 2, 3],
    text: 'Foes have {v%} more health.', per: 0.2, apply(m, v) { m.foeHp *= 1 + v; } },
  { id: 'sharpened', name: 'Sharpened Needles', icon: 'blade', max: 3, fray: [1, 2, 3],
    text: 'Foes deal {v%} more damage.', per: 0.25, apply(m, v) { m.foeDmg *= 1 + v; } },
  { id: 'hurried', name: 'Hurried Unravelling', icon: 'wing', max: 2, fray: [1, 2],
    text: 'Foes move and attack {v%} faster.', per: 0.12, apply(m, v) { m.foeSpeed *= 1 + v; } },
  { id: 'gaze', name: 'Sable\'s Gaze', icon: 'eye', max: 3, fray: [1, 2, 3],
    text: 'Foes have a {v%} chance to arrive as Elites.', per: 0.12, apply(m, v) { m.eliteChance += v; } },
  { id: 'regent', name: 'Wrath of the Regents', icon: 'crown', max: 2, fray: [2, 4],
    text: 'Bosses have {v%} more Armour and turn to their second phase sooner.', per: 0.4, apply(m, v) { m.bossArmor *= 1 + v; m.bossPhaseFast += v * 0.25; } },
  { id: 'thin', name: 'Thin Thread', icon: 'heal', max: 3, fray: [1, 2, 3],
    text: 'All healing is {v%} weaker.', per: 0.25, apply(m, v) { m.healMult *= Math.max(0, 1 - v); } },
  { id: 'scarce', name: 'Scarce Gifts', icon: 'card', max: 1, fray: [2],
    text: 'Boon offers show one fewer choice.', per: 1, apply(m, v) { m.offerCount -= v; } },
  { id: 'brittle', name: 'Brittle Spool', icon: 'spool', max: 1, fray: [3],
    text: 'The Second Spool will not hold you: no death defiance from the Tapestry.', per: 1, apply(m) { m.deathDefianceOff = true; } },
  { id: 'tide', name: 'Rising Dark', icon: 'clock', max: 2, fray: [2, 3],
    text: 'Each region must be crossed within {v} minutes, or the dark rises and hurts you.', per: -3, base: 15,
    apply(m, v, rank) { m.timeLimit = (15 - 3 * (rank - 1)) * 60; } },
  { id: 'teeming', name: 'Teeming Dream', icon: 'wave', max: 2, fray: [2, 3],
    text: 'Combat chambers hold {v} more wave(s) of foes.', per: 1, apply(m, v) { m.extraWave += v; } },
];
export const PACT_BY_ID = Object.fromEntries(PACTS.map((p) => [p.id, p]));

export function pactMods(pacts) {
  const m = { foeHp: 1, foeDmg: 1, foeSpeed: 1, eliteChance: 0, bossArmor: 1, bossPhaseFast: 0, healMult: 1, offerCount: 0, deathDefianceOff: false, timeLimit: 0, hazardDmg: 1, extraWave: 0, fray: 0 };
  for (const p of PACTS) {
    const rank = Math.max(0, Math.min(p.max, (pacts && pacts[p.id]) | 0));
    if (!rank) continue;
    p.apply(m, p.per * rank, rank);
    m.fray += p.fray[rank - 1];
  }
  return m;
}
export function pactText(id, rank) {
  const p = PACT_BY_ID[id]; if (!p) return '';
  const r = Math.max(1, rank);
  const v = p.id === 'tide' ? 15 - 3 * (r - 1) : p.per * r;
  return p.text.replace('{v%}', Math.round(v * 100) + '%').replace('{v}', String(v));
}
// Bonus on a clear with this much Fray: Lumen multiplier and extra Silk Keys.
export const frayReward = (fray) => ({ lumenMult: 1 + fray * 0.1, keys: Math.floor(fray / 4) });
