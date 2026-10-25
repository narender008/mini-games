// Braids: duo boons, one for each pair of the six patrons (15). Data only.
// A Braid is offered (by either of its patrons) once you own one boon from each of its
// two `needs` groups. It sits in no slot, so it never swaps anything out. Braids are
// always offered at 'epic' strength (rarity label 'braid'); Knots level them up.
// Effects that change how other powers behave set s.flags.<name>; the runtime in
// src/sim/boons.js (sunspots, riptides, cyclones, quakes, chains) reads those flags.

const CHAIN = ['veyra.attack', 'veyra.snare', 'veyra.special', 'veyra.call', 'veyra.dash'];
const SOAK = ['maru.attack', 'maru.dash', 'maru.snare', 'maru.call', 'maru.special'];
const BURN = ['solenne.attack', 'solenne.snare', 'solenne.call', 'solenne.dash', 'solenne.halo'];
const BLIND = ['solenne.special', 'solenne.dash', 'solenne.call', 'solenne.halo'];
const DAWN_ANY = ['solenne.attack', 'solenne.special', 'solenne.snare', 'solenne.dash', 'solenne.call'];
const QUAKE = ['ossian.dash', 'ossian.special', 'ossian.call', 'ossian.rebuke', 'ossian.avalanche'];
const WARD = ['ossian.granite'];
const CRIT = ['ilu.attack', 'ilu.special', 'ilu.snare', 'ilu.dash', 'ilu.call'];
const CYCLONE = ['kestrel.attack', 'kestrel.special', 'kestrel.call'];
const WIND_DASH = ['kestrel.dash', 'kestrel.slipstream', 'kestrel.farflight', 'kestrel.quicken'];
const WAVE = ['maru.special', 'maru.call', 'maru.ebb', 'maru.attack'];
const SLOW = SOAK;

export const BRAIDS = [
  {
    id: 'braid.stormsurge', patrons: ['veyra', 'maru'], name: 'Stormsurge',
    text: 'Lightning that strikes a Soaked or Slowed foe surges through the water to every foe within reach for {v} damage. Your riptides crackle.',
    values: [26, 26, 34, 42], needs: [CHAIN, SOAK],
    line: { veyra: 'Water conducts! Told you!', maru: 'Fine. FINE. It is very pretty.' },
    hooks: {
      stats(s) { s.flags.stormsurge = true; },
      onHit(G, c, v, K, b) {
        const e = c.target;
        if (c.element !== 'storm' || c.surge || !(K.has(e, 'soak') || K.has(e, 'slow')) || !K.cd(G, b, 'surge' + e.id, 0.5)) return;
        K.fx(G, 'surge', { x: e.x, y: e.y, r: 170 });
        for (const f of K.foesNear(G, e.x, e.y, 170)) if (f !== e) { K.arc(G, e, f); K.dmg(G, f, v, { element: 'storm', surge: true, kb: 80 }); }
      },
    },
  },
  {
    id: 'braid.sunstorm', patrons: ['solenne', 'veyra'], name: 'Sunstorm',
    text: 'Your lightning sets foes Burning for {v} per second, and Burning foes carry each arc one leap farther.',
    values: [10, 10, 13, 16], needs: [BURN, CHAIN],
    line: { solenne: 'Lightning that burns. At last, something of hers I can approve of.', veyra: 'Golden lightning! Sol, look, it\'s us!' },
    hooks: {
      stats(s) { s.flags.sunstorm = true; },
      onHit(G, c, v, K) { if (c.element === 'storm' && K.alive(c.target)) K.burn(G, c.target, v); },
    },
  },
  {
    id: 'braid.steam', patrons: ['solenne', 'maru'], name: 'Scalding Mist',
    text: 'Water that strikes a Burning foe flashes into scalding steam: {v} damage around it, Blinding everything caught.',
    values: [30, 30, 38, 46], needs: [BURN, SOAK],
    line: { solenne: 'Steam. Hm. Maru, this is the closest we have come to agreeing.', maru: 'Hot bath for everyone!' },
    hooks: {
      onHit(G, c, v, K, b) {
        const e = c.target;
        if (c.element !== 'tide' || !K.has(e, 'burn') || !K.cd(G, b, 'steam' + e.id, 0.7)) return;
        K.power(G, 'steam', { x: e.x, y: e.y, r: 120, life: 1.6 });
        for (const f of K.area(G, e.x, e.y, 130, v, { element: 'dawn', kb: 120 })) K.blind(G, f, 2.5);
      },
    },
  },
  {
    id: 'braid.molten', patrons: ['solenne', 'ossian'], name: 'Molten Core',
    text: 'Your quakes split the floor into seams of molten light that Burn foes on them for {v} per second.',
    values: [14, 14, 18, 22], needs: [BURN, QUAKE],
    line: { solenne: 'Stone holds fire well.', ossian: 'A hearth. Hm.' },
    hooks: { stats(s, v) { s.flags.molten = v; } },
  },
  {
    id: 'braid.eventide', patrons: ['solenne', 'ilu'], name: 'Eventide',
    text: 'Every blow on a Blinded foe is a Critical hit, and Critical hits Blind for {v}s.',
    values: [2, 2, 2.5, 3], needs: [BLIND, CRIT],
    line: { solenne: 'I blind them. She cuts them. I will not say it twice.', ilu: 'Dusk is where we meet, sister.' },
    hooks: {
      beforeHit(G, c, v, K) { if (c.kind !== 'boon' && K.has(c.target, 'blind')) c.crit = true; },
      onHit(G, c, v, K) { if (c.crit && K.alive(c.target)) K.blind(G, c.target, v); },
    },
  },
  {
    id: 'braid.solarwind', patrons: ['solenne', 'kestrel'], name: 'Solar Wind',
    text: 'Your cyclones burn with dawn fire, setting foes Burning for {v} per second, and leave a Sunspot where they die out.',
    values: [10, 10, 13, 16], needs: [DAWN_ANY, CYCLONE],
    line: { solenne: 'Do not scatter it everywhere, Kestrel.', kestrel: 'Scattering it everywhere!' },
    hooks: { stats(s, v) { s.flags.solarwind = v; } },
  },
  {
    id: 'braid.mudslide', patrons: ['maru', 'ossian'], name: 'Mudslide',
    text: 'Your waves and quakes leave clinging mud behind. Foes in the mud are Rooted for {v}s and Slowed after.',
    values: [1.2, 1.2, 1.5, 1.8], needs: [WAVE.concat(['maru.dash']), QUAKE],
    line: { maru: 'Mud pies! Oh, don\'t look at me like that, Ossian.', ossian: 'Hm. Effective.' },
    hooks: { stats(s, v) { s.flags.mudslide = v; } },
  },
  {
    id: 'braid.blackwater', patrons: ['maru', 'ilu'], name: 'Black Water',
    text: 'Foes you Slow are Marked. Your Critical hits on Slowed foes deal {v%} more damage.',
    values: [0.4, 0.4, 0.55, 0.7], needs: [SLOW, CRIT],
    line: { maru: 'Deep water, dear. Mind what lives at the bottom.', ilu: 'Down where no light reaches. Lovely.' },
    hooks: {
      stats(s) { s.flags.blackwater = true; },
      afterCrit(G, c, v, K) { if (c.crit && K.has(c.target, 'slow')) c.bonus += v; },
    },
  },
  {
    id: 'braid.monsoon', patrons: ['maru', 'kestrel'], name: 'Monsoon',
    text: 'Your cyclones become waterspouts: they Soak and Slow, drag foes inward, and break as a wave for {v} damage when they fade.',
    values: [24, 24, 30, 36], needs: [SOAK, CYCLONE],
    line: { maru: 'Storm season, darling. Hold your hood.', kestrel: 'Wheeee!' },
    hooks: { stats(s, v) { s.flags.monsoon = v; } },
  },
  {
    id: 'braid.lodestone', patrons: ['veyra', 'ossian'], name: 'Lodestone',
    text: 'Your quakes throw chain lightning to 3 foes for {v} damage, and every blow your Ward absorbs looses arcs at nearby foes.',
    values: [18, 18, 24, 30], needs: [CHAIN, QUAKE.concat(WARD)],
    line: { veyra: 'Rocks that bite! Ossian, you sly thing.', ossian: 'Iron in the hills. Always was.' },
    hooks: {
      stats(s, v) { s.flags.lodestone = v; },
      beforeHurt(G, c, v, K, b) {
        if (!(G.hero.armor > 0) || !(c.dmg > 0) || !K.cd(G, b, 'lode', 0.4)) return;
        const t = K.nearest(G, G.hero.x, G.hero.y, 300);
        if (t) { K.arc(G, G.hero, t); K.dmg(G, t, v, { element: 'storm' }); K.chain(G, t, 2, v); }
      },
    },
  },
  {
    id: 'braid.darkthunder', patrons: ['veyra', 'ilu'], name: 'Dark Thunder',
    text: 'Your Critical hits call down a bolt of black lightning for {v} damage.',
    values: [36, 36, 46, 56], needs: [CHAIN, CRIT],
    line: { veyra: 'BLACK lightning. I said it would be rude.', ilu: 'Shall we be dramatic? We shall.' },
    hooks: {
      onHit(G, c, v, K, b) {
        if (!c.crit || c.kind === 'boon' || !K.cd(G, b, 'dark', 0.25)) return;
        K.strike(G, c.target.x, c.target.y, { dmg: v, element: 'storm', r: 90, delay: 0.08, style: 'black' });
      },
    },
  },
  {
    id: 'braid.thunderhead', patrons: ['veyra', 'kestrel'], name: 'Thunderhead',
    text: 'Your cyclones crackle with storm, arcing at a foe near them every 0.4s for {v} damage.',
    values: [12, 12, 16, 20], needs: [CHAIN, CYCLONE],
    line: { veyra: 'Race you to them!', kestrel: 'Already there!' },
    hooks: { stats(s, v) { s.flags.thunderhead = v; } },
  },
  {
    id: 'braid.obsidian', patrons: ['ossian', 'ilu'], name: 'Obsidian Edge',
    text: 'Critical hits deal triple damage to Armour. While your Ward holds, you gain {v%} Critical chance.',
    values: [0.15, 0.15, 0.2, 0.25], needs: [QUAKE.concat(WARD, ['ossian.attack']), CRIT],
    line: { ossian: 'Volcanic glass. Sharp.', ilu: 'He makes it, I use it. A perfect marriage.' },
    hooks: {
      beforeHit(G, c, v) { if ((G.hero.armor || 0) > 0) c.critChance += v; },
      afterCrit(G, c) { if (c.crit && c.target.armor > 0) c.armorMult = (c.armorMult || 1) * 3; },
    },
  },
  {
    id: 'braid.sandstorm', patrons: ['ossian', 'kestrel'], name: 'Sandstorm',
    text: 'Your quakes whip up a stinging sand cyclone that Blinds and deals {v} damage to the foes it catches.',
    values: [8, 8, 10, 12], needs: [QUAKE, WIND_DASH.concat(CYCLONE)],
    line: { ossian: 'Old dust. Hm.', kestrel: 'Can\'t see a thing! Perfect!' },
    hooks: { stats(s, v) { s.flags.sandstorm = v; } },
  },
  {
    id: 'braid.phantom', patrons: ['ilu', 'kestrel'], name: 'Phantom Gale',
    text: 'Each Dash leaves a shadow of you where you started; a breath later it strikes every foe near it for {v} damage, and can Crit.',
    values: [28, 28, 36, 44], needs: [CRIT, WIND_DASH],
    line: { ilu: 'Two of you now. Three, if you count the wind.', kestrel: 'Fast AND sneaky!' },
    hooks: { onDash(G, c, v, K) { K.power(G, 'phantom', { x: c.x, y: c.y, life: 0.45, dmg: v, r: 120, facing: Math.atan2(c.dy, c.dx) }); } },
  },
];
