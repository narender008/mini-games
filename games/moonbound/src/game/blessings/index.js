// Blessings of the Celestine. Each patron file lists eight: one for each of
// Maelis's four moves (Attack, Special, Cast, Dash; a move holds one blessing
// at a time, a new one replaces it) and four passives. A blessing is data plus
// apply(mods, value): the heroine's modifiers are rebuilt from scratch from
// the blessings she holds (rebuild()), so nothing is ever applied twice.
// Rarity scales the value: values[rarity].
//
// To add a patron: a file like vaela.js, an entry in PATRONS, an icon colour,
// and (if it brings a new status) a case in status.js.
import { VAELA } from './vaela.js';
import { AURIN } from './aurin.js';
import { UMBRIEL } from './umbriel.js';
import { CORVANE } from './corvane.js';

export const PATRONS = { vaela: VAELA, aurin: AURIN, umbriel: UMBRIEL, corvane: CORVANE };
export const PATRON_LIST = [VAELA, AURIN, UMBRIEL, CORVANE];

export const RARITIES = [
  { id: 0, name: 'Faint', hex: '#c9ced8', weight: 62 },
  { id: 1, name: 'Bright', hex: '#7fc8ff', weight: 27 },
  { id: 2, name: 'Radiant', hex: '#c58cff', weight: 9 },
  { id: 3, name: 'Celestial', hex: '#ffd36a', weight: 2 },
];

export const SLOTS = ['attack', 'special', 'cast', 'dash'];
export const SLOT_NAMES = { attack: 'Attack', special: 'Special', cast: 'Cast', dash: 'Dash', passive: 'Gift' };

export const BLESSINGS = {};
for (const p of PATRON_LIST) {
  for (const b of p.blessings) {
    b.patron = p.id;
    BLESSINGS[b.id] = b;
  }
}

// the heroine's modifiers with no blessings (and the run's own boosts applied by run.js)
export function baseMods() {
  return {
    dmg: { attack: 1, special: 1, cast: 1, dash: 1, all: 1 },
    inflict: { attack: [], special: [], cast: [], dash: [] },
    crit: 0,
    critMul: 2,
    critVsUmbra: 0,
    speed: 1,
    dashCharges: 1,
    dashIframes: 0,
    dashTrail: null,
    dashFlash: 0,
    dashThrough: [],
    afterDash: 0,
    castCharges: 0, // extra charges
    castRadius: 1,
    castFreeze: 0,
    castPull: false,
    castUmbra: 0,
    castKnock: 3,
    castStyle: 'moon',
    maxHp: 0,
    clearHeal: 0,
    dmgTaken: 1,
    hurtNova: null,
    ward: 0,
    vsChill: 0,
    vsFull: 0,
    shatter: 0,
    chillTime: 4,
    freezeTime: 1.3,
    dawnDamage: 30,
    dawnRadius: 1.9,
    umbraMax: 5,
    umbraDamage: 3,
    harvest: 0,
    starOnAttack: 0,
    starOnSpecial: 0,
    silver: 1,
    luck: 0,
  };
}

// held: [{id, rarity}] in the order taken
export function rebuild(held, extra) {
  const m = baseMods();
  // a move keeps only its newest blessing
  const slotHolder = {};
  for (const h of held) {
    const b = BLESSINGS[h.id];
    if (b && b.slot !== 'passive') slotHolder[b.slot] = h;
  }
  for (const h of held) {
    const b = BLESSINGS[h.id];
    if (!b) continue;
    if (b.slot !== 'passive' && slotHolder[b.slot] !== h) continue;
    b.apply(m, b.values[h.rarity] ?? b.values[0]);
  }
  extra?.(m);
  return m;
}

// the blessings that count (a replaced move blessing drops out of the list)
export function active(held) {
  const slotHolder = {};
  for (const h of held) {
    const b = BLESSINGS[h.id];
    if (b && b.slot !== 'passive') slotHolder[b.slot] = h;
  }
  return held.filter((h) => {
    const b = BLESSINGS[h.id];
    return b && (b.slot === 'passive' || slotHolder[b.slot] === h);
  });
}

// Three blessings from one patron to choose from. Moves the heroine has no blessing on yet come first, then
// passives she lacks; a move already blessed by another patron may be offered (it would replace that one).
export function offer(held, patronId, rng, luck = 0, count = 3) {
  const p = PATRONS[patronId];
  const have = new Set(active(held).map((h) => h.id));
  const filled = new Set(active(held).map((h) => BLESSINGS[h.id].slot).filter((s) => s !== 'passive'));
  const pool = p.blessings.filter((b) => !have.has(b.id));
  // weight: open moves are likeliest, then passives, then replacing a move
  const weight = (b) => (b.slot === 'passive' ? 1 : filled.has(b.slot) ? 0.45 : 1.8);
  const picks = [];
  const list = pool.slice();
  while (picks.length < count && list.length) {
    let tot = 0;
    for (const b of list) tot += weight(b);
    let r = rng.next() * tot;
    let k = 0;
    for (; k < list.length - 1; k++) {
      r -= weight(list[k]);
      if (r <= 0) break;
    }
    picks.push(list.splice(k, 1)[0]);
  }
  return picks.map((b) => ({ id: b.id, rarity: rollRarity(rng, luck) }));
}

export function rollRarity(rng, luck = 0) {
  const w = RARITIES.map((r, i) => r.weight * (i === 0 ? Math.max(0.2, 1 - luck * 2) : 1 + luck * 3 * i));
  let tot = w.reduce((a, b) => a + b, 0);
  let r = rng.next() * tot;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return 0;
}

export function describe(h) {
  const b = BLESSINGS[h.id];
  return b.text(b.values[h.rarity] ?? b.values[0]);
}
