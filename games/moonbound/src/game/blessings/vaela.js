// Vaela of the Waning Moon: frost. Her blessings Chill foes (each stack slows
// them; five stacks freeze them solid) and make frozen foes brittle.
export const VAELA = {
  id: 'vaela',
  name: 'Vaela',
  title: 'of the Waning Moon',
  hex: '#9fe8ff',
  colour: [0.62, 0.91, 1.0],
  status: 'chill',
  blurb: 'The cold, patient light of the waning moon. Her gifts slow, freeze and shatter.',
  lines: [
    'Still walking, little witch? Then walk where the frost has been.',
    'The cold keeps what it takes. Let it take them.',
    'I have watched a hundred years of midnight. Make this one end.',
    'Ice remembers. So should they.',
  ],
  blessings: [
    {
      id: 'vaela_attack',
      slot: 'attack',
      name: 'Frost Edge',
      values: [20, 30, 40, 55],
      text: (v) => `Your Attack deals <b>+${v}%</b> damage and inflicts <i>Chill</i>.`,
      apply(m, v) {
        m.dmg.attack *= 1 + v / 100;
        m.inflict.attack.push('chill');
      },
    },
    {
      id: 'vaela_special',
      slot: 'special',
      name: 'Rime Arc',
      values: [30, 45, 60, 80],
      text: (v) => `Your Special deals <b>+${v}%</b> damage and inflicts <i>Chill</i> twice.`,
      apply(m, v) {
        m.dmg.special *= 1 + v / 100;
        m.inflict.special.push('chill', 'chill');
      },
    },
    {
      id: 'vaela_cast',
      slot: 'cast',
      name: 'Frozen Rune',
      values: [1.0, 1.4, 1.8, 2.4],
      text: (v) => `Your Moon Rune <b>freezes</b> foes for <b>${v}s</b> and deals +40% damage.`,
      apply(m, v) {
        m.dmg.cast *= 1.4;
        m.castFreeze = Math.max(m.castFreeze, v);
        m.castStyle = 'frost';
      },
    },
    {
      id: 'vaela_dash',
      slot: 'dash',
      name: 'Glacial Step',
      values: [12, 18, 24, 32],
      text: (v) => `Your Dash leaves a frost trail that deals <b>${v}</b> damage and inflicts <i>Chill</i>.`,
      apply(m, v) {
        m.dashTrail = { kind: 'frost', damage: v, status: 'chill' };
      },
    },
    {
      id: 'vaela_hoarfrost',
      slot: 'passive',
      name: 'Hoarfrost',
      values: [15, 22, 30, 40],
      text: (v) => `Foes with <i>Chill</i> take <b>+${v}%</b> damage from you.`,
      apply(m, v) {
        m.vsChill += v / 100;
      },
    },
    {
      id: 'vaela_ward',
      slot: 'passive',
      name: "Winter's Ward",
      values: [10, 15, 20, 25],
      text: (v) => `You take <b>${v}%</b> less damage; when hit, a frost burst <i>Chills</i> foes around you.`,
      apply(m, v) {
        m.dmgTaken *= 1 - v / 100;
        m.hurtNova = 'frost';
      },
    },
    {
      id: 'vaela_shatter',
      slot: 'passive',
      name: 'Shatterpoint',
      values: [30, 45, 60, 80],
      text: (v) => `Frozen foes that die burst into ice shards, dealing <b>${v}</b> damage around them.`,
      apply(m, v) {
        m.shatter = Math.max(m.shatter, v);
      },
    },
    {
      id: 'vaela_longnight',
      slot: 'passive',
      name: 'Long Night',
      values: [1.0, 1.5, 2.0, 2.6],
      text: (v) => `<i>Chill</i> lasts longer and freezing holds foes <b>+${v}s</b> longer.`,
      apply(m, v) {
        m.chillTime += 2;
        m.freezeTime += v;
      },
    },
  ],
};
