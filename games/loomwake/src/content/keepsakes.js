// Keepsakes: gifts from the people of the Loomhall (and two from the Reverie). Carry one
// per run, chosen in the hub (meta.loadout.keepsake). Each grows through 3 ranks as you
// clear chambers carrying it (meta.keepsakeXp[id], thresholds RANK_AT). Data only.
//
// KEEPSAKES[key] = { id: 'keepsake.<key>', key, giver, name, text ({v}), values: [rank1, rank2, rank3],
//   unlock: { gift: npcId } | { flag: storyFlag }, hooks }
// The runtime reads values at rank (as rarity common/rare/epic). Flags the runtime or
// run.js read: s.firstBoonRare (orrin), s.firstHitImmune (thimbleby), s.glintMult (pell),
// s.regionHeal (nell), s.dreamDefy (weaver), s.favour (patrons).

export const RANK_AT = [0, 10, 25]; // chambers cleared while carried for ranks 1, 2, 3

export const KEEPSAKES = {
  orrin: {
    id: 'keepsake.orrin', key: 'orrin', giver: 'orrin', name: 'Archivist\'s Quill', unlock: { gift: 'orrin' },
    text: 'The first boon offered in each region is at least Rare, and {v%} of all boons are upgraded one rarity.',
    flavour: '"Write down the good parts, too," he said. "Someone ought to."',
    values: [0.05, 0.1, 0.15],
    hooks: { stats(s, v) { s.firstBoonRare = true; s.rarityBonus += v; } },
  },
  thimbleby: {
    id: 'keepsake.thimbleby', key: 'thimbleby', giver: 'thimbleby', name: 'Silver Thimble', unlock: { gift: 'thimbleby' },
    text: 'The first blow you take in each chamber is turned aside, and you take {v%} less damage from bosses.',
    flavour: 'Dented, polished, dented again. It fits your thumb exactly.',
    values: [0.1, 0.15, 0.2],
    hooks: {
      onRoomStart(G, c, v, K, b) { K.mem(G, b).used = false; },
      beforeHurt(G, c, v, K, b) {
        const m = K.mem(G, b);
        if (c.src && K.isBoss(G, c.src)) c.dmg *= 1 - v;
        if (!m.used && c.dmg > 0) { m.used = true; c.dmg = 0; c.dodged = true; K.fx(G, 'thimble', { x: G.hero.x, y: G.hero.y }); }
      },
    },
  },
  pell: {
    id: 'keepsake.pell', key: 'pell', giver: 'pell', name: 'Lucky Button', unlock: { gift: 'pell' },
    text: 'You find {v%} more Glint, and shops sell to you for a little less.',
    flavour: 'Four holes, one of them slightly larger. "That\'s the lucky one."',
    values: [0.25, 0.4, 0.55],
    hooks: { stats(s, v) { s.glintMult += v; s.shopDiscount += v * 0.4; } },
  },
  nell: {
    id: 'keepsake.nell', key: 'nell', giver: 'nell', name: 'Halfspun Ribbon', unlock: { gift: 'nell' },
    text: 'Gain {v} max health. Entering a new region restores 30% of your health.',
    flavour: 'Faded red. She does not remember tying it, only that it mattered.',
    values: [10, 20, 30],
    hooks: { stats(s, v) { s.maxHp += v; s.regionHeal = Math.max(s.regionHeal, 0.3); } },
  },
  weaver: {
    id: 'keepsake.weaver', key: 'weaver', giver: 'weaver', name: 'Dream-Silk', unlock: { flag: 'weaverStirred' },
    text: 'Once per run, when you would fall, the Weaver\'s dream holds you: rise again with {v%} health.',
    flavour: 'Warm, as if someone was just holding it.',
    values: [0.3, 0.4, 0.5],
    hooks: { stats(s, v) { s.dreamDefy = v; s.deathDefiance += 1; } },
  },
  patrons: {
    id: 'keepsake.patrons', key: 'patrons', giver: 'patrons', name: 'Sixfold Knot', unlock: { gift: 'nell', count: 3 },
    text: 'Boons from the first patron you accept are always at least Rare, and {v%} more likely to be Epic.',
    flavour: 'Six colours tied together. They squabble even here.',
    values: [0.1, 0.2, 0.3],
    hooks: { stats(s, v) { s.favour = v; } },
  },
  veyl: {
    id: 'keepsake.veyl', key: 'veyl', giver: 'veyl', name: 'Glass Rose', unlock: { flag: 'reveal1' },
    text: 'Foes that strike you are cut by glass thorns for {v} damage.',
    flavour: '"Tell him I kept the roses."',
    values: [20, 30, 40],
    hooks: {
      onHurt(G, c, v, K) {
        if (!c.src || !K.alive(c.src)) return;
        K.fx(G, 'thorns', { x: c.src.x, y: c.src.y });
        K.dmg(G, c.src, v, { kind: 'thorns', element: 'dawn', kb: 200 });
      },
    },
  },
  sable: {
    id: 'keepsake.sable', key: 'sable', giver: 'sable', name: 'Black Knot', unlock: { flag: 'reveal3' },
    text: 'You deal {v%} more damage, but your Call gauge fills half as fast. "Two ends of the same cut."',
    flavour: 'It is tied in a knot no one can undo. You suspect no one ever tried.',
    values: [0.2, 0.27, 0.35],
    hooks: { stats(s, v) { s.dmg *= 1 + v; s.callGain *= 0.5; } },
  },
};

export const KEEPSAKE_IDS = Object.keys(KEEPSAKES);
export function keepsakeRank(meta, key) {
  const xp = (meta && meta.keepsakeXp && meta.keepsakeXp[key]) || 0;
  return xp >= RANK_AT[2] ? 3 : xp >= RANK_AT[1] ? 2 : 1;
}
export const keepsakeByKey = (k) => KEEPSAKES[String(k).replace(/^keepsake\./, '')] || null;
