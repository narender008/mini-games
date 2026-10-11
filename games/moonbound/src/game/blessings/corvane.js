// Corvane the Wandering Comet: speed. His blessings call falling stars down
// on foes, leave comet fire in Maelis's wake and lend her swiftness.
export const CORVANE = {
  id: 'corvane',
  name: 'Corvane',
  title: 'the Wandering Comet',
  hex: '#ff8a6a',
  colour: [1.0, 0.54, 0.42],
  status: 'starfall',
  blurb: 'A comet that never stops for long. His gifts bring stars crashing down and put wind at your back.',
  lines: [
    'Faster, witch! The sky does not wait and neither do I.',
    'Stand still and they catch you. Keep moving!',
    'Every star falls somewhere. I choose where.',
    'Ha! Leave a trail they will be talking about for a century.',
  ],
  blessings: [
    {
      id: 'corvane_attack',
      slot: 'attack',
      name: 'Comet Strike',
      values: [18, 26, 34, 46],
      text: (v) => `Every third Attack hit calls a falling star down on the foe for <b>${v}</b> damage.`,
      apply(m, v) {
        m.starOnAttack = Math.max(m.starOnAttack, v);
      },
    },
    {
      id: 'corvane_special',
      slot: 'special',
      name: 'Starfall',
      values: [16, 22, 30, 40],
      text: (v) => `Your Special calls stars down around you, each dealing <b>${v}</b> damage.`,
      apply(m, v) {
        m.starOnSpecial = Math.max(m.starOnSpecial, v);
      },
    },
    {
      id: 'corvane_cast',
      slot: 'cast',
      name: 'Meteor Rune',
      values: [70, 95, 120, 160],
      text: (v) => `Your Moon Rune calls a meteor that strikes for <b>+${v}%</b> damage and knocks foes away.`,
      apply(m, v) {
        m.dmg.cast *= 1 + v / 100;
        m.castKnock = 10;
        m.castStyle = 'meteor';
      },
    },
    {
      id: 'corvane_dash',
      slot: 'dash',
      name: 'Comet Trail',
      values: [10, 15, 20, 28],
      text: (v) => `Your Dash leaves a trail of comet fire that deals <b>${v}</b> damage.`,
      apply(m, v) {
        m.dashTrail = { kind: 'comet', damage: v, status: null };
      },
    },
    {
      id: 'corvane_swift',
      slot: 'passive',
      name: 'Swift Orbit',
      values: [8, 12, 16, 22],
      text: (v) => `You run <b>+${v}%</b> faster.`,
      apply(m, v) {
        m.speed *= 1 + v / 100;
      },
    },
    {
      id: 'corvane_secondwind',
      slot: 'passive',
      name: 'Second Wind',
      values: [1, 1, 1, 2],
      text: (v) => `You can Dash <b>${v}</b> more time${v > 1 ? 's' : ''} in a row.`,
      apply(m, v) {
        m.dashCharges += v;
      },
    },
    {
      id: 'corvane_luck',
      slot: 'passive',
      name: "Wanderer's Luck",
      values: [25, 35, 45, 60],
      text: (v) => `Find <b>+${v}%</b> more silver; rarer blessings come to you more often.`,
      apply(m, v) {
        m.silver *= 1 + v / 100;
        m.luck += v / 300;
      },
    },
    {
      id: 'corvane_trajectory',
      slot: 'passive',
      name: 'Trajectory',
      values: [20, 30, 40, 55],
      text: (v) => `For <b>1.5s</b> after you Dash, you deal <b>+${v}%</b> damage.`,
      apply(m, v) {
        m.afterDash += v / 100;
      },
    },
  ],
};
