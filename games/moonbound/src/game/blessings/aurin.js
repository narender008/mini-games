// Aurin the Dawn Star: light. His blessings set a Dawnmark on foes that
// bursts into sunfire a moment later, and lend Maelis vigour.
export const AURIN = {
  id: 'aurin',
  name: 'Aurin',
  title: 'the Dawn Star',
  hex: '#ffcf6a',
  colour: [1.0, 0.81, 0.42],
  status: 'dawnmark',
  blurb: 'The last star before morning. His gifts mark foes for a burst of dawn, and keep your heart burning.',
  lines: [
    'There will be a morning. I have sworn it.',
    'Mark them, and let the dawn do the rest.',
    'Every light you carry up those walls is one more I can see by.',
    'Burn bright, Moonbound. Brighter than they can bear.',
  ],
  blessings: [
    {
      id: 'aurin_attack',
      slot: 'attack',
      name: 'Dawnblade',
      values: [15, 22, 30, 40],
      text: (v) => `Your Attack deals <b>+${v}%</b> damage and sets a <i>Dawnmark</i>.`,
      apply(m, v) {
        m.dmg.attack *= 1 + v / 100;
        m.inflict.attack.push('dawnmark');
      },
    },
    {
      id: 'aurin_special',
      slot: 'special',
      name: 'Sunflare',
      values: [30, 45, 60, 80],
      text: (v) => `Your Special deals <b>+${v}%</b> damage, sets a <i>Dawnmark</i> and dazzles foes briefly.`,
      apply(m, v) {
        m.dmg.special *= 1 + v / 100;
        m.inflict.special.push('dawnmark', 'daze');
      },
    },
    {
      id: 'aurin_cast',
      slot: 'cast',
      name: 'Daybreak Rune',
      values: [60, 80, 100, 130],
      text: (v) => `Your Moon Rune bursts into a dawn nova, dealing <b>+${v}%</b> damage over a wider area.`,
      apply(m, v) {
        m.dmg.cast *= 1 + v / 100;
        m.castRadius *= 1.3;
        m.castStyle = 'dawn';
      },
    },
    {
      id: 'aurin_dash',
      slot: 'dash',
      name: 'Gleaming Step',
      values: [15, 22, 30, 40],
      text: (v) => `Where your Dash ends, a flash of dawn deals <b>${v}</b> damage around you.`,
      apply(m, v) {
        m.dashFlash = Math.max(m.dashFlash, v);
      },
    },
    {
      id: 'aurin_heart',
      slot: 'passive',
      name: 'Kindled Heart',
      values: [15, 20, 25, 35],
      text: (v) => `<b>+${v}</b> max health, and heal <b>${Math.round(v / 3)}</b> after each chamber.`,
      apply(m, v) {
        m.maxHp += v;
        m.clearHeal += Math.round(v / 3);
      },
    },
    {
      id: 'aurin_ward',
      slot: 'passive',
      name: 'Solar Ward',
      values: [14, 12, 10, 8],
      text: (v) => `A ward of light blocks the next hit you take; it returns after <b>${v}s</b>.`,
      apply(m, v) {
        m.ward = m.ward ? Math.min(m.ward, v) : v;
      },
    },
    {
      id: 'aurin_zenith',
      slot: 'passive',
      name: 'Zenith',
      values: [40, 60, 80, 110],
      text: (v) => `<i>Dawnmark</i> bursts deal <b>+${v}%</b> damage and reach farther.`,
      apply(m, v) {
        m.dawnDamage *= 1 + v / 100;
        m.dawnRadius *= 1.35;
      },
    },
    {
      id: 'aurin_firstlight',
      slot: 'passive',
      name: 'First Light',
      values: [40, 60, 80, 110],
      text: (v) => `You deal <b>+${v}%</b> damage to foes at full health.`,
      apply(m, v) {
        m.vsFull += v / 100;
      },
    },
  ],
};
