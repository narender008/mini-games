// The Moonwell Cauldron's lasting upgrades, bought with moonshards between
// runs (save.data.upgrades[id] = rank). apply(mods, rank) runs when a run
// starts, like a blessing that is always held. To add one: an entry here.
export const UPGRADES = [
  {
    id: 'roots',
    name: 'Deep Roots',
    icon: 'heart',
    max: 5,
    cost: (r) => 8 + r * 6,
    text: (r) => `+${10 * r} max health.`,
    next: '+10 max health',
    apply(m, r) {
      m.maxHp += 10 * r;
    },
  },
  {
    id: 'moonsteel',
    name: 'Moonsteel',
    icon: 'blade',
    max: 5,
    cost: (r) => 10 + r * 8,
    text: (r) => `+${5 * r}% damage with every weapon.`,
    next: '+5% damage',
    apply(m, r) {
      m.dmg.all *= 1 + 0.05 * r;
    },
  },
  {
    id: 'shadowstep',
    name: 'Shadowstep',
    icon: 'dash',
    max: 1,
    cost: () => 40,
    text: () => 'Dash twice in a row.',
    next: 'Dash twice in a row',
    apply(m, r) {
      m.dashCharges += r;
    },
  },
  {
    id: 'tidewell',
    name: 'Tidewell',
    icon: 'rune',
    max: 2,
    cost: (r) => 25 + r * 20,
    text: (r) => `+${r} Moon Rune charge${r > 1 ? 's' : ''}.`,
    next: '+1 Moon Rune charge',
    apply(m, r) {
      m.castCharges += r;
    },
  },
  {
    id: 'lastlight',
    name: 'Last Light',
    icon: 'moon',
    max: 2,
    cost: (r) => 30 + r * 30,
    text: (r) => `Once${r > 1 ? ' or twice' : ''} a run, rise again from a killing blow with 40% health.`,
    next: 'One more rise from a killing blow',
    apply() {},
  },
  {
    id: 'favour',
    name: "Pedlar's Favour",
    icon: 'coin',
    max: 3,
    cost: (r) => 12 + r * 10,
    text: (r) => `The Pale Pedlar asks ${10 * r}% less.`,
    next: '10% lower prices',
    apply() {},
  },
  {
    id: 'star',
    name: 'Lucky Star',
    icon: 'star',
    max: 3,
    cost: (r) => 15 + r * 12,
    text: (r) => `Rarer blessings come ${['', 'a little', 'more', 'much more'][r]} often.`,
    next: 'Rarer blessings more often',
    apply(m, r) {
      m.luck += 0.06 * r;
    },
  },
  {
    id: 'purse',
    name: 'Silver Purse',
    icon: 'purse',
    max: 3,
    cost: (r) => 10 + r * 8,
    text: (r) => `Begin each run with ${30 * r} silver.`,
    next: '+30 starting silver',
    apply() {},
  },
];

export const UPGRADE = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function rank(save, id) {
  return save.upgrades[id] || 0;
}

export function applyUpgrades(save, m) {
  for (const u of UPGRADES) {
    const r = rank(save, u.id);
    if (r) u.apply(m, r);
  }
}
