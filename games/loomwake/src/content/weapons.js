// The five Instruments, their Aspects (3 each, unlocked with Silk Keys) and Tempers
// (weapon variants; a run offers Temper cards and you may take two). Data only.
//
// WEAPONS[id] = { id, name, title, text, color, color2, order, unlock: { keys },
//   moves: { attack, special, dashStrike }, aspects: [ { id, name, giver, text, cost: { keys },
//   values, hooks } ], tempers: [ { id, name, text, values, hooks } ] }
// Aspects and Tempers are effect sources like boons: hooks.stats(s, v, G) may set the
// weapon tuning block s.w.<knob> that the weapon sim reads (src/sim/weapons/<id>.js
// documents its knobs), or use the ordinary event hooks. Aspect values are read at
// rarity 'common'; Tempers at the rarity rolled on their card.
//
// Blade's sim is the engine's (sim/weapons/blade.js), so Blade aspects and tempers use
// only stats and hooks.

const r4 = (a, b, c, d) => [a, b, c, d];

export const WEAPON_IDS = ['blade', 'spear', 'bow', 'gauntlets', 'chakram'];
export const TEMPER_LIMIT = 2;

export const WEAPONS = {
  blade: {
    id: 'blade', name: 'Shuttle Blade', title: 'the Weaver\'s Shuttle', order: 0, color: '#ffd27a', color2: '#fff1c4',
    text: 'A curved sword of woven light, quick and true. Three swings, the last a wide crescent.',
    unlock: { keys: 0 },
    moves: { attack: 'Three-swing combo, the last a heavy crescent', special: 'Thread Lunge: a piercing dash-thrust', dashStrike: 'Dash-strike: a quick cut out of the dash' },
    aspects: [
      { id: 'aspect.blade.iri', giver: 'iri', name: 'Aspect of Iri', cost: { keys: 0 },
        text: 'The last swing of each combo deals {v%} more damage.', values: [0.3],
        hooks: {
          onAttack(G, c, v, K, b) { K.mem(G, b).combo = c.combo; },
          beforeHit(G, c, v, K, b) { if (c.kind === 'attack' && K.mem(G, b).combo === 2) c.bonus += v; },
        } },
      { id: 'aspect.blade.thimbleby', giver: 'thimbleby', name: 'Aspect of Thimbleby', cost: { keys: 2 },
        text: 'A needle that decided to be brave: gain a Ward of {ward} each chamber, and your Special deals {sp%} more damage.',
        values: { ward: 25, sp: 0.25 },
        hooks: { stats(s, v) { s.maxArmor += v.ward; s.specialDmg *= 1 + v.sp; } } },
      { id: 'aspect.blade.sable', giver: 'sable', name: 'Aspect of Sable', cost: { keys: 4 }, secret: 'reveal3',
        text: 'The black edge: you deal {dmg%} more damage and gain {crit%} Critical chance, but have {hp} less max health.',
        values: { dmg: 0.2, crit: 0.08, hp: 20 },
        hooks: { stats(s, v) { s.dmg *= 1 + v.dmg; s.critChance += v.crit; s.maxHp -= v.hp; } } },
    ],
    tempers: [
      { id: 'temper.blade.keen', name: 'Keen Edge', text: 'Your Attack deals {v%} more damage.', values: r4(0.2, 0.26, 0.32, 0.4),
        hooks: { stats(s, v) { s.attackDmg *= 1 + v; } } },
      { id: 'temper.blade.hilt', name: 'Weighted Hilt', text: 'Your Special deals {v%} more damage and knocks foes farther.', values: r4(0.3, 0.4, 0.5, 0.6),
        hooks: { stats(s, v) { s.specialDmg *= 1 + v; s.knock += 0.15; s.kbMult += 0.15; } } },
      { id: 'temper.blade.wrist', name: 'Quick Wrist', text: 'Your Attack is {v%} faster.', values: r4(0.12, 0.15, 0.18, 0.22),
        hooks: { stats(s, v) { s.attackSpeed += v; } } },
      { id: 'temper.blade.mercy', name: 'Executioner\'s Thread', text: 'You deal {v%} more damage to foes below 35% health.', values: r4(0.4, 0.5, 0.6, 0.75),
        hooks: { beforeHit(G, c, v) { const e = c.target; if (e.hp < e.maxHp * 0.35) c.bonus += v; } } },
      { id: 'temper.blade.guard', name: 'Guardian Edge', text: 'Gain a Ward of {v} each chamber.', values: r4(15, 20, 25, 30),
        hooks: { stats(s, v) { s.maxArmor += v; } } },
      { id: 'temper.blade.drink', name: 'Thread-Drinker', text: 'Slaying a foe with your Attack restores {v} health.', values: r4(1, 1.5, 2, 2.5),
        hooks: { onKill(G, c, v, K) { if (c.kind === 'attack') K.heal(G, v, { x: c.e.x, y: c.e.y }); } } },
    ],
  },

  spear: {
    id: 'spear', name: 'Spindle Spear', title: 'the Long Spindle', order: 1, color: '#9fd8ff', color2: '#e8f6ff',
    text: 'A long spindle tipped with a needle of starlight. Great reach; throw it, then call it home through everything in its way.',
    unlock: { keys: 1 },
    moves: { attack: 'Two long thrusts, then a sweeping spin', special: 'Throw the spear; press again to recall it through foes', dashStrike: 'Dash-thrust: a lunging stab' },
    aspects: [
      { id: 'aspect.spear.iri', giver: 'iri', name: 'Aspect of Iri', cost: { keys: 0 },
        text: 'Your thrown spear and its recall deal {v%} more damage.', values: [0.3],
        hooks: { stats(s, v) { s.w.throwDmg = (s.w.throwDmg || 1) + v; } } },
      { id: 'aspect.spear.veyl', giver: 'veyl', name: 'Aspect of Veyl', cost: { keys: 2 }, secret: 'reveal1',
        text: 'The Thorn Regent\'s spindle: where the thrown spear lands, glass thorns erupt for {v} damage, and the recall drags foes with it.',
        values: [40],
        hooks: { stats(s, v) { s.w.thorns = v; s.w.recallPull = 1; } } },
      { id: 'aspect.spear.aurum', giver: 'aurum', name: 'Aspect of Aurum', cost: { keys: 4 }, secret: 'reveal3',
        text: 'Forge-hot: your spin sweep is {v%} wider and leaves a ring of molten gold that Burns foes.',
        values: [0.4],
        hooks: { stats(s, v) { s.w.spinR = (s.w.spinR || 1) + v; s.w.spinBurn = 12; } } },
    ],
    tempers: [
      { id: 'temper.spear.haft', name: 'Long Haft', text: 'Your thrusts reach {v%} farther.', values: r4(0.2, 0.25, 0.3, 0.35),
        hooks: { stats(s, v) { s.w.reach = (s.w.reach || 1) + v; } } },
      { id: 'temper.spear.recall', name: 'Homeward Thread', text: 'Your recall deals {v%} more damage and flies twice as fast.', values: r4(0.5, 0.65, 0.8, 1),
        hooks: { stats(s, v) { s.w.recallDmg = (s.w.recallDmg || 1) + v; s.w.recallSpeed = 2; } } },
      { id: 'temper.spear.whirl', name: 'Whirling Haft', text: 'Your spin sweep deals {v%} more damage and spins twice.', values: r4(0.3, 0.4, 0.5, 0.6),
        hooks: { stats(s, v) { s.w.spinDmg = (s.w.spinDmg || 1) + v; s.w.spinTwice = true; } } },
      { id: 'temper.spear.anchor', name: 'Anchor Throw', text: 'Foes near where your spear lands are Rooted for {v}s.', values: r4(1.2, 1.5, 1.8, 2.1),
        hooks: { stats(s, v) { s.w.anchor = v; } } },
      { id: 'temper.spear.barb', name: 'Barbed Head', text: 'Foes struck by your thrown spear take {v%} more damage from your Attack for 4s.', values: r4(0.3, 0.4, 0.5, 0.6),
        hooks: { beforeHit(G, c, v, K) { if (c.kind === 'attack' && K.has(c.target, 'barb')) c.bonus += v; } } },
      { id: 'temper.spear.twin', name: 'Twin Spindles', text: 'Your Special throws two spears in a narrow V, each dealing {v%} of the damage.', values: r4(0.65, 0.72, 0.8, 0.9),
        hooks: { stats(s, v) { s.w.twin = v; } } },
    ],
  },

  bow: {
    id: 'bow', name: 'Warp Bow', title: 'the Warp and Weft', order: 2, color: '#c7a6ff', color2: '#f3e8ff',
    text: 'A bow strung with a single warp thread. Hold to draw; release at the bright moment for a piercing Perfect shot.',
    unlock: { keys: 2 },
    moves: { attack: 'Hold to draw, release to loose; release in the flash for a Perfect shot', special: 'Volley: a fan of arrows', dashStrike: 'Dash-shot: a quick snap arrow' },
    aspects: [
      { id: 'aspect.bow.iri', giver: 'iri', name: 'Aspect of Iri', cost: { keys: 0 },
        text: 'You draw {v%} faster, and Perfect shots pierce one more foe.', values: [0.2],
        hooks: { stats(s, v) { s.w.draw = (s.w.draw || 1) + v; s.w.pierce = (s.w.pierce || 0) + 1; } } },
      { id: 'aspect.bow.orrin', giver: 'orrin', name: 'Aspect of Orrin', cost: { keys: 2 },
        text: 'Moth-light: your arrows light foes up; your Volley seeks the moth-lit and deals {v%} more damage to them.', values: [0.5],
        hooks: { stats(s, v) { s.w.markShots = true; s.w.seekMarked = v; } } },
      { id: 'aspect.bow.morrow', giver: 'morrow', name: 'Aspect of Morrow', cost: { keys: 4 }, secret: 'reveal2',
        text: 'The Cantor\'s hymn: a Perfect shot sings, sending a ring of sound from the foe it strikes for {v} damage.', values: [35],
        hooks: { stats(s, v) { s.w.hymn = v; } } },
    ],
    tempers: [
      { id: 'temper.bow.taut', name: 'Taut String', text: 'You draw {v%} faster.', values: r4(0.25, 0.3, 0.35, 0.4),
        hooks: { stats(s, v) { s.w.draw = (s.w.draw || 1) + v; } } },
      { id: 'temper.bow.heavy', name: 'Heavy Draw', text: 'Fully drawn shots deal {v%} more damage.', values: r4(0.3, 0.4, 0.5, 0.6),
        hooks: { stats(s, v) { s.w.fullDmg = (s.w.fullDmg || 1) + v; } } },
      { id: 'temper.bow.split', name: 'Splitting Head', text: 'Charged arrows split into 3 when they strike, each shard dealing {v%} damage.', values: r4(0.35, 0.4, 0.45, 0.5),
        hooks: { stats(s, v) { s.w.split = v; } } },
      { id: 'temper.bow.wide', name: 'Wide Volley', text: 'Your Volley looses {v} more arrows.', values: { r: r4(2, 2, 3, 4), lvl: 0 },
        hooks: { stats(s, v) { s.w.volley = (s.w.volley || 0) + v; } } },
      { id: 'temper.bow.ricochet', name: 'Ricochet', text: 'Your arrows leap to {v} more foes after they strike.', values: { r: r4(1, 1, 2, 2), lvl: 0 },
        hooks: { stats(s, v) { s.w.ricochet = (s.w.ricochet || 0) + v; } } },
      { id: 'temper.bow.stride', name: 'Light Stride', text: 'You move {v%} faster while drawing.', values: r4(0.5, 0.6, 0.7, 0.8),
        hooks: { stats(s, v) { s.w.drawMove = v; } } },
    ],
  },

  gauntlets: {
    id: 'gauntlets', name: 'Heddle Gauntlets', title: 'the Heddle Fists', order: 3, color: '#ffb36b', color2: '#ffe8cc',
    text: 'Heavy loom-heddles bound into fists. A rapid flurry of blows; burst out of a Dash into a flying punch.',
    unlock: { keys: 3 },
    moves: { attack: 'A five-blow flurry ending in an uppercut', special: 'Loom Slam: leap and crash down', dashStrike: 'Dash-punch: a flying fist out of the dash' },
    aspects: [
      { id: 'aspect.gauntlets.iri', giver: 'iri', name: 'Aspect of Iri', cost: { keys: 0 },
        text: 'Your Dash-punch deals {v%} more damage.', values: [0.5],
        hooks: { stats(s, v) { s.w.dashPunch = (s.w.dashPunch || 1) + v; } } },
      { id: 'aspect.gauntlets.pell', giver: 'pell', name: 'Aspect of Pell', cost: { keys: 2 },
        text: 'Lucky knuckles: every 6th blow is a Critical hit, and slain foes drop {v} more Glint.', values: [2],
        hooks: {
          stats(s, v) { s.glintMult += 0.1; s.w.lucky = 6; },
          onKill(G, c, v) { if (G.run) G.run.glintBonus = (G.run.glintBonus || 0) + v; },
        } },
      { id: 'aspect.gauntlets.nell', giver: 'nell', name: 'Aspect of Nell', cost: { keys: 4 }, secret: 'reveal1',
        text: 'Halfspun: each blow Frays the foe; at 8 Frays they unravel for {v} damage.', values: [45],
        hooks: { stats(s, v) { s.w.fray = v; } } },
    ],
    tempers: [
      { id: 'temper.gauntlets.iron', name: 'Iron Knuckles', text: 'Your Attack deals {v%} more damage.', values: r4(0.2, 0.26, 0.32, 0.4),
        hooks: { stats(s, v) { s.attackDmg *= 1 + v; } } },
      { id: 'temper.gauntlets.flurry', name: 'Flurry', text: 'Your Attack is {v%} faster.', values: r4(0.15, 0.2, 0.25, 0.3),
        hooks: { stats(s, v) { s.attackSpeed += v; } } },
      { id: 'temper.gauntlets.rising', name: 'Rising Uppercut', text: 'Your uppercut launches foes, Stunning them for {v}s.', values: r4(0.8, 1, 1.2, 1.4),
        hooks: { stats(s, v) { s.w.uppercutStun = v; } } },
      { id: 'temper.gauntlets.comet', name: 'Comet Punch', text: 'Your Dash-punch flies {v%} farther and bursts on impact.', values: r4(0.5, 0.6, 0.7, 0.8),
        hooks: { stats(s, v) { s.w.cometReach = v; s.w.comet = true; } } },
      { id: 'temper.gauntlets.shock', name: 'Shockwave Slam', text: 'Your Loom Slam reaches {v%} wider.', values: r4(0.4, 0.5, 0.6, 0.7),
        hooks: { stats(s, v) { s.w.slamR = (s.w.slamR || 1) + v; } } },
      { id: 'temper.gauntlets.counter', name: 'Counterweight', text: 'Your Loom Slam first drags nearby foes in, then deals {v%} more damage.', values: r4(0.25, 0.3, 0.35, 0.4),
        hooks: { stats(s, v) { s.w.slamPull = true; s.specialDmg *= 1 + v; } } },
    ],
  },

  chakram: {
    id: 'chakram', name: 'Bobbin Chakram', title: 'the Twin Bobbins', order: 4, color: '#8ff5d0', color2: '#e6fff6',
    text: 'Two bladed bobbins on a single thread. Throw them to ricochet from foe to foe; they always find their way home.',
    unlock: { keys: 4 },
    moves: { attack: 'Throw a bobbin that leaps between foes and returns', special: 'Bobbin Spin: both bobbins whirl around you', dashStrike: 'Dash-throw: both bobbins at once' },
    aspects: [
      { id: 'aspect.chakram.iri', giver: 'iri', name: 'Aspect of Iri', cost: { keys: 0 },
        text: 'Your bobbins leap to {v} more foe before they return.', values: [1],
        hooks: { stats(s, v) { s.w.bounces = (s.w.bounces || 0) + v; } } },
      { id: 'aspect.chakram.weaver', giver: 'weaver', name: 'Aspect of the Weaver', cost: { keys: 2 },
        text: 'The thread between your bobbins cuts: while both fly, foes crossing the thread take {v} damage.', values: [10],
        hooks: { stats(s, v) { s.w.tether = v; } } },
      { id: 'aspect.chakram.sable', giver: 'sable', name: 'Aspect of Sable', cost: { keys: 4 }, secret: 'reveal3',
        text: 'A third, black bobbin. Each bobbin deals {v%} less damage.', values: [0.2],
        hooks: { stats(s, v) { s.w.count = 3; s.w.discDmg = (s.w.discDmg || 1) - v; } } },
    ],
    tempers: [
      { id: 'temper.chakram.keen', name: 'Keen Rims', text: 'Your bobbins deal {v%} more damage.', values: r4(0.2, 0.26, 0.32, 0.4),
        hooks: { stats(s, v) { s.w.discDmg = (s.w.discDmg || 1) + v; } } },
      { id: 'temper.chakram.leap', name: 'Restless Bobbin', text: 'Your bobbins leap to {v} more foes.', values: { r: r4(1, 1, 2, 2), lvl: 0 },
        hooks: { stats(s, v) { s.w.bounces = (s.w.bounces || 0) + v; } } },
      { id: 'temper.chakram.far', name: 'Long Thread', text: 'Your bobbins fly {v%} farther and faster.', values: r4(0.3, 0.4, 0.5, 0.6),
        hooks: { stats(s, v) { s.w.range = (s.w.range || 1) + v; } } },
      { id: 'temper.chakram.spin', name: 'Whirlwind Spin', text: 'Your Bobbin Spin lasts {v%} longer and reaches wider.', values: r4(0.5, 0.6, 0.7, 0.8),
        hooks: { stats(s, v) { s.w.spinT = (s.w.spinT || 1) + v; s.w.spinR = 1.3; } } },
      { id: 'temper.chakram.catch', name: 'Quick Catch', text: 'Catching a bobbin grants {v%} more damage to your next throw.', values: r4(0.3, 0.4, 0.5, 0.6),
        hooks: { stats(s, v) { s.w.catchBonus = v; } } },
      { id: 'temper.chakram.hover', name: 'Hovering Bobbin', text: 'Your bobbins hover where they stop for {v}s, shredding foes, before returning.', values: r4(0.6, 0.8, 1, 1.2),
        hooks: { stats(s, v) { s.w.hover = v; } } },
    ],
  },
};

export const weaponList = () => WEAPON_IDS.map((id) => WEAPONS[id]);
export const aspectsOf = (weapon) => (WEAPONS[weapon] ? WEAPONS[weapon].aspects : []);
export const tempersOf = (weapon) => (WEAPONS[weapon] ? WEAPONS[weapon].tempers : []);
