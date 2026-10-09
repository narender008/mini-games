// Weapons, level-up upgrades and evolutions.
//
// Weapons all fire on their own; upgrades change shared stats, so every gun
// gets stronger together. An evolution card appears once two named upgrades
// are both maxed (and the weapon it changes is owned), e.g. Multishot III +
// Piercing III turns the Blaster into the Railgun.
import { rnd } from '../config.js';

// stars: a weapon found again levels up (more damage, faster)
export const WEAPONS = {
  blaster: { name: 'Blaster', icon: 'blaster', interval: 0.12, dmg: 11, speed: 1500, pellets: 1, spread: 0, gap: 16, life: 1.1, kb: 26, size: 11, color: [0.35, 0.75, 1.6], sound: 'blaster' },
  scatter: { name: 'Scatter Gun', icon: 'scatter', interval: 0.6, dmg: 9, speed: 1150, pellets: 7, spread: 0.5, gap: 0, life: 0.45, kb: 150, size: 6, color: [1.6, 0.9, 0.3], sound: 'scatter', perShot: 2 },
  rocket: { name: 'Rocket Pod', icon: 'rocket', interval: 0.95, dmg: 40, speed: 330, accel: 1500, pellets: 1, spread: 0.12, gap: 22, life: 1.6, kb: 60, size: 10, blast: 78, blastDmg: 38, color: [1.6, 0.7, 0.25], sound: 'rocket' },
  railgun: { name: 'Railgun', icon: 'railgun', interval: 0.32, dmg: 34, beam: true, pellets: 1, gap: 18, kb: 90, size: 9, color: [0.4, 1.2, 2.2], sound: 'railgun' },
};

export const STAR_DMG = [1, 1, 1.3, 1.65];
export const STAR_RATE = [1, 1, 1.12, 1.25];

// Upgrades: max level, card colour, what one level does (`apply`), the card text for the NEXT level.
export const UPGRADES = [
  { id: 'firerate', name: 'Fire Rate', icon: 'firerate', color: 'blue', max: 5, text: () => '+20% Fire Rate', apply: (s) => (s.rate *= 1.2) },
  { id: 'damage', name: 'Damage', icon: 'damage', color: 'red', max: 5, text: () => '+25% Damage', apply: (s) => (s.dmg *= 1.25) },
  { id: 'multishot', name: 'Multishot', icon: 'multishot', color: 'blue', max: 3, text: () => '+1 Projectile', apply: (s) => (s.multi += 1) },
  { id: 'pierce', name: 'Piercing', icon: 'pierce', color: 'purple', max: 3, text: () => 'Shots pierce +1 enemy', apply: (s) => (s.pierce += 1) },
  { id: 'crit', name: 'Crit Chance', icon: 'crit', color: 'purple', max: 4, text: () => '+10% Crit Chance', apply: (s) => (s.crit += 0.1) },
  { id: 'maxhp', name: 'Max HP', icon: 'maxhp', color: 'green', max: 5, text: () => '+25 Max Health, heal 25', apply: (s, run) => { s.maxHp += 25; run.heal(25); } },
  { id: 'speed', name: 'Swift Boots', icon: 'speed', color: 'green', max: 3, text: () => '+12% Move Speed', apply: (s) => (s.move *= 1.12) },
  { id: 'knockback', name: 'Heavy Rounds', icon: 'knockback', color: 'red', max: 3, text: () => '+40% Knockback, +10% Damage', apply: (s) => { s.kb *= 1.4; s.dmg *= 1.1; } },
  { id: 'explosive', name: 'Explosive Rounds', icon: 'explosive', color: 'red', max: 3, text: (l) => `${[12, 20, 28][l]}% of hits explode`, apply: (s) => (s.explosive += 1) },
  { id: 'chain', name: 'Chain Lightning', icon: 'chain', color: 'gold', max: 3, text: (l) => `${[10, 16, 22][l]}% of hits arc to ${l + 2} foes`, apply: (s) => (s.chain += 1) },
  { id: 'magnet', name: 'Magnet', icon: 'magnet', color: 'blue', max: 3, text: () => '+45% XP pickup range', apply: (s) => (s.magnet *= 1.45) },
  { id: 'cooldown', name: 'Quick Hands', icon: 'cooldown', color: 'green', max: 3, text: () => 'Bombs and shields recharge 20% faster', apply: (s) => (s.cooldown *= 0.8) },
  { id: 'regen', name: 'Regeneration', icon: 'regen', color: 'green', max: 3, text: () => '+0.8 HP per second', apply: (s) => (s.regen += 0.8) },
  { id: 'freezer', name: 'Frost Rounds', icon: 'freezer', color: 'blue', max: 3, text: (l) => `${[6, 10, 14][l]}% of hits freeze for 2 s`, apply: (s) => (s.freezer += 1) },
  { id: 'bombup', name: 'Demolition', icon: 'bombup', color: 'red', max: 2, text: () => '+1 Bomb, +25% blast size', apply: (s, run) => { s.bombR *= 1.25; run.abil.bomb.max += 1; run.abil.bomb.charges += 1; } },
  { id: 'shieldup', name: 'Bulwark', icon: 'shieldup', color: 'blue', max: 2, text: () => '+1 Shield, +1 s duration', apply: (s, run) => { s.shieldTime += 1; run.abil.shield.max += 1; run.abil.shield.charges += 1; } },
];
export const UP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export const EVOLUTIONS = [
  { id: 'railgun', name: 'RAILGUN', icon: 'railgun', needs: ['multishot', 'pierce'], weapon: 'blaster', text: 'Blaster evolves: piercing rail beams', apply: (s, run) => run.evolveWeapon('blaster', 'railgun') },
  { id: 'stormcaller', name: 'STORM CALLER', icon: 'stormcaller', needs: ['chain', 'crit'], text: 'Every crit chains lightning; storms strike the horde', apply: (s) => (s.storm = true) },
  { id: 'carpetbomb', name: 'CARPET BOMB', icon: 'carpetbomb', needs: ['explosive', 'firerate'], text: 'Every hit explodes in a bigger blast', apply: (s) => (s.carpet = true) },
];

export function baseStats(meta) {
  return {
    rate: 1, dmg: 1 + 0.08 * (meta.firepower || 0), multi: 0, pierce: 0, crit: 0.05 + 0.03 * (meta.lucky || 0), critMul: 2.2,
    maxHp: 100 + 10 * (meta.vitality || 0), move: 1, kb: 1, explosive: 0, chain: 0, magnet: 1 + 0.2 * (meta.magnetism || 0),
    cooldown: 1 - 0.08 * (meta.hands || 0), regen: 0, freezer: 0, bombR: 1, shieldTime: 3.5, storm: false, carpet: false,
  };
}

// Three cards for a level-up: an evolution when one is ready, then random upgrades that are not maxed.
export function drawCards(run, n = 3) {
  const lv = run.levels;
  const cards = [];
  for (const e of EVOLUTIONS) {
    if (run.evolved[e.id]) continue;
    if (e.weapon && !run.weapons.some((w) => w.id === e.weapon)) continue;
    if (e.needs.every((id) => (lv[id] || 0) >= UP[id].max)) {
      cards.push({ id: e.id, name: e.name, text: e.text, icon: e.icon, color: 'gold', level: 1, max: 1, evolution: true, weapon: !!e.weapon });
      break;
    }
  }
  const pool = UPGRADES.filter((u) => (lv[u.id] || 0) < u.max);
  // weight toward upgrades that lead to an evolution the player has started
  const weight = (u) => {
    let w = 1;
    for (const e of EVOLUTIONS) if (!run.evolved[e.id] && e.needs.includes(u.id) && e.needs.some((id) => id !== u.id && (lv[id] || 0) > 0)) w += 0.8;
    if ((lv[u.id] || 0) > 0) w += 0.3;
    return w;
  };
  while (cards.length < n && pool.length) {
    let tot = 0;
    for (const u of pool) tot += weight(u);
    let r = rnd() * tot;
    let k = 0;
    for (; k < pool.length - 1; k++) {
      r -= weight(pool[k]);
      if (r <= 0) break;
    }
    const u = pool.splice(k, 1)[0];
    const l = lv[u.id] || 0;
    cards.push({ id: u.id, name: u.name, text: u.text(l), icon: u.icon, color: u.color, level: l + 1, max: u.max, evolution: false, weapon: false });
  }
  return cards;
}

export function applyCard(run, card) {
  if (card.evolution) {
    const e = EVOLUTIONS.find((x) => x.id === card.id);
    run.evolved[e.id] = true;
    e.apply(run.stats, run);
    return e;
  }
  const u = UP[card.id];
  run.levels[u.id] = (run.levels[u.id] || 0) + 1;
  u.apply(run.stats, run);
  return u;
}
