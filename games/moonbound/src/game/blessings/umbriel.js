// Umbriel of the Eclipse: shadow. Her blessings lay Umbra on foes (a
// creeping darkness that eats at them over time) and sharpen critical hits.
export const UMBRIEL = {
  id: 'umbriel',
  name: 'Umbriel',
  title: 'of the Eclipse',
  hex: '#b48cff',
  colour: [0.71, 0.55, 1.0],
  status: 'umbra',
  blurb: 'The shadow that crosses the moon. Her gifts let darkness eat at foes, and find their weak places.',
  lines: [
    'Even the moon has a dark side, sister. Use it.',
    'Let the shadow do the slow work. You do the quick.',
    'They fear the dark? Then give them more of it.',
    'An eclipse is only a moment. Make it count.',
  ],
  blessings: [
    {
      id: 'umbriel_attack',
      slot: 'attack',
      name: 'Shadow Cut',
      values: [10, 15, 20, 28],
      text: (v) => `Your Attack deals <b>+${v}%</b> damage and lays <i>Umbra</i>.`,
      apply(m, v) {
        m.dmg.attack *= 1 + v / 100;
        m.inflict.attack.push('umbra');
      },
    },
    {
      id: 'umbriel_special',
      slot: 'special',
      name: 'Penumbra',
      values: [25, 40, 55, 75],
      text: (v) => `Your Special deals <b>+${v}%</b> damage and lays <i>Umbra</i> twice.`,
      apply(m, v) {
        m.dmg.special *= 1 + v / 100;
        m.inflict.special.push('umbra', 'umbra');
      },
    },
    {
      id: 'umbriel_cast',
      slot: 'cast',
      name: 'Eclipse Rune',
      values: [3, 4, 5, 6],
      text: (v) => `Your Moon Rune drags foes into its heart, then lays <b>${v}</b> stacks of <i>Umbra</i>.`,
      apply(m, v) {
        m.castPull = true;
        m.castUmbra = Math.max(m.castUmbra, v);
        m.castStyle = 'eclipse';
      },
    },
    {
      id: 'umbriel_dash',
      slot: 'dash',
      name: 'Umbral Passage',
      values: [0.1, 0.15, 0.2, 0.28],
      text: (v) => `Dashing through foes lays <i>Umbra</i>; you stay unseen <b>${v}s</b> longer.`,
      apply(m, v) {
        m.dashThrough.push('umbra');
        m.dashIframes += v;
      },
    },
    {
      id: 'umbriel_deep',
      slot: 'passive',
      name: 'Deepening Dark',
      values: [3, 4, 5, 6],
      text: (v) => `<i>Umbra</i> stacks up to <b>${5 + v}</b> times and bites harder.`,
      apply(m, v) {
        m.umbraMax = 5 + v;
        m.umbraDamage *= 1.3;
      },
    },
    {
      id: 'umbriel_omen',
      slot: 'passive',
      name: 'Grim Omen',
      values: [12, 18, 24, 32],
      text: (v) => `<b>+${v}%</b> chance to strike critically against foes with <i>Umbra</i>.`,
      apply(m, v) {
        m.critVsUmbra += v / 100;
      },
    },
    {
      id: 'umbriel_totality',
      slot: 'passive',
      name: 'Totality',
      values: [5, 8, 11, 15],
      text: (v) => `<b>+${v}%</b> chance to strike critically; critical hits deal <b>+50%</b> more.`,
      apply(m, v) {
        m.crit += v / 100;
        m.critMul += 0.5;
      },
    },
    {
      id: 'umbriel_harvest',
      slot: 'passive',
      name: 'Night Harvest',
      values: [2, 3, 4, 5],
      text: (v) => `Foes that die under <i>Umbra</i> leave a shadow-soul that heals <b>${v}</b>.`,
      apply(m, v) {
        m.harvest = Math.max(m.harvest, v);
      },
    },
  ],
};
