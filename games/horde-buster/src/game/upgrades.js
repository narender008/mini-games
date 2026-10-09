// Weapons, level-up upgrades and evolutions.
//
// The hero holds one gun, which fires on its own. Weapon crates swap it on the
// spot, or level it up (to 3 stars) when the crate holds the same gun; each
// gun keeps its own stars. Upgrades change shared stats, so whatever gun is
// held gets stronger. An evolution card appears once two named upgrades are
// both maxed (and the weapon it changes has been found), e.g. Multishot III +
// Piercing III turns the Blaster into the Railgun.
import { rnd } from '../config.js';

export { WEAPONS, STAR_DMG, STAR_RATE, STAR_SIZE } from './weapons.js';

// Level tables for the upgrades whose effect grows by uneven steps: the TOTAL after each level. The card text and
// `apply` both read them, so what a card promises is what the stat gets. `gain` is the step the level just taken
// adds (applyCard raises run.levels before it calls apply; a bare call counts as level 1).
const IGNITE = [0.08, 0.14, 0.2];
const LEECH = [0.15, 0.3, 0.45];
const EXECUTE = [0.08, 0.12, 0.16];
const CORPSE = [0.08, 0.14, 0.2];
const pct = (v) => Math.round(v * 100);
const gain = (tab, run, id) => {
  const l = Math.min(tab.length, Math.max(1, run?.levels?.[id] || 1));
  return tab[l - 1] - (l > 1 ? tab[l - 2] : 0);
};

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
  // ---- stage 2
  { id: 'incendiary', name: 'Incendiary Rounds', icon: 'incendiary', color: 'red', max: 3, text: (l) => `${pct(IGNITE[l])}% of hits set foes alight`, apply: (s, run) => (s.ignite += gain(IGNITE, run, 'incendiary')) },
  { id: 'deadeye', name: 'Deadeye', icon: 'deadeye', color: 'purple', max: 3, text: () => '+50% Crit Damage', apply: (s) => (s.critMul += 0.5) },
  { id: 'armour', name: 'Armour Plating', icon: 'armour', color: 'green', max: 3, text: (l) => `Take ${10 * (l + 1)}% less damage`, apply: (s) => (s.armor += 0.1) },
  { id: 'bloodthirst', name: 'Bloodthirst', icon: 'bloodthirst', color: 'red', max: 3, text: (l) => `Heal 1 HP every ${Math.round(1 / LEECH[l])} kills`, apply: (s, run) => (s.leech += gain(LEECH, run, 'bloodthirst')) },
  { id: 'greed', name: 'Greed', icon: 'greed', color: 'gold', max: 3, text: () => '+15% XP from gems', apply: (s) => (s.xpMul += 0.15) },
  { id: 'lucky', name: 'Lucky Charm', icon: 'lucky', color: 'gold', max: 3, text: () => '+25% drops: crates, surges, pickups', apply: (s) => (s.luck += 0.25) },
  { id: 'adrenaline', name: 'Adrenaline', icon: 'adrenaline', color: 'green', max: 2, text: () => 'Power surges last 3 s longer', apply: (s) => (s.surgeTime += 3) },
  { id: 'bigshot', name: 'Big Bullets', icon: 'bigshot', color: 'red', max: 3, text: () => '+25% Bullet Size, +10% Damage', apply: (s) => { s.size += 0.25; s.dmg *= 1.1; } },
  { id: 'executioner', name: 'Executioner', icon: 'executioner', color: 'purple', max: 3, text: (l) => `Foes under ${pct(EXECUTE[l])}% health die at once`, apply: (s, run) => (s.execute += gain(EXECUTE, run, 'executioner')) },
  { id: 'corpsebomb', name: 'Corpse Bomb', icon: 'corpsebomb', color: 'red', max: 3, text: (l) => `${pct(CORPSE[l])}% of kills explode`, apply: (s, run) => (s.corpse += gain(CORPSE, run, 'corpsebomb')) },
  { id: 'bounce', name: 'Ricochet', icon: 'bounce', color: 'blue', max: 2, text: (l) => `Shots ricochet to ${l + 1} more foe${l ? 's' : ''}`, apply: (s) => (s.bounce += 1) },
];
export const UP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// An evolution card appears once both `needs` upgrades are maxed (and, for a gun's evolution, that gun has been
// found this run); the gun's slot then fires the evolved gun (WEAPONS[id] in weapons.js) from then on.
export const EVOLUTIONS = [
  { id: 'railgun', name: 'RAILGUN', icon: 'railgun', needs: ['multishot', 'pierce'], weapon: 'blaster', text: 'Blaster evolves: piercing rail beams', apply: (s, run) => run.evolveWeapon('blaster', 'railgun') },
  { id: 'inferno', name: 'INFERNO', icon: 'inferno', needs: ['incendiary', 'firerate'], weapon: 'flamer', text: 'Flamethrower evolves: a long blue-white jet', apply: (s, run) => run.evolveWeapon('flamer', 'inferno') },
  { id: 'swarm', name: 'SWARM POD', icon: 'swarm', needs: ['explosive', 'multishot'], weapon: 'rocket', text: 'Rocket Pod evolves: salvos of homing mini rockets', apply: (s, run) => run.evolveWeapon('rocket', 'swarm') },
  { id: 'dragon', name: "DRAGON'S BREATH", icon: 'dragon', needs: ['incendiary', 'knockback'], weapon: 'scatter', text: 'Scatter Gun evolves: burning, bursting shells', apply: (s, run) => run.evolveWeapon('scatter', 'dragon') },
  { id: 'thunder', name: 'THUNDERGOD', icon: 'thunder', needs: ['chain', 'crit'], weapon: 'tesla', text: 'Tesla Gun evolves: forking storm bolts', apply: (s, run) => run.evolveWeapon('tesla', 'thunder') },
  { id: 'bloodmill', name: 'BLOODMILL', icon: 'bloodmill', needs: ['pierce', 'bigshot'], weapon: 'saw', text: 'Saw Launcher evolves: huge blades that come back', apply: (s, run) => run.evolveWeapon('saw', 'bloodmill') },
  { id: 'stormcaller', name: 'STORM CALLER', icon: 'stormcaller', needs: ['chain', 'deadeye'], text: 'Every crit chains lightning; storms strike the horde', apply: (s) => (s.storm = true) },
  { id: 'carpetbomb', name: 'CARPET BOMB', icon: 'carpetbomb', needs: ['explosive', 'firerate'], text: 'Every hit explodes in a bigger blast', apply: (s) => (s.carpet = true) },
];

export function baseStats(meta) {
  return {
    rate: 1, dmg: 1 + 0.08 * (meta.firepower || 0), multi: 0, pierce: 0, crit: 0.05 + 0.03 * (meta.lucky || 0), critMul: 2.2,
    maxHp: 100 + 10 * (meta.vitality || 0), move: 1, kb: 1, explosive: 0, chain: 0, magnet: 1 + 0.2 * (meta.magnetism || 0),
    cooldown: 1 - 0.08 * (meta.hands || 0), regen: 0, freezer: 0, bombR: 1, shieldTime: 3.5, storm: false, carpet: false,
    // armor: share of damage blocked; leech: HP per kill; xpMul: XP per gem; luck: extra chance on every drop;
    // surgeTime: seconds added to surges; size: projectile size; ignite: chance a hit sets the foe alight;
    // execute: share of max HP below which a non-boss foe dies at once; corpse: chance a kill explodes; bounce: ricochets
    armor: 0, leech: 0, xpMul: 1, luck: 0, surgeTime: 0, size: 1, ignite: 0, execute: 0, corpse: 0, bounce: 0,
  };
}

// An evolution is in play once it is not taken yet and, for a gun's evolution, that gun has been found this run.
const live = (run, e) => !run.evolved[e.id] && (!e.weapon || run.arms[e.weapon] > 0);

// Three cards for a level-up: an evolution when one is ready, then random upgrades that are not maxed.
export function drawCards(run, n = 3) {
  const lv = run.levels;
  const cards = [];
  for (const e of EVOLUTIONS) {
    if (!live(run, e)) continue;
    if (e.needs.every((id) => UP[id] && (lv[id] || 0) >= UP[id].max)) {
      cards.push({ id: e.id, name: e.name, text: e.text, icon: e.icon, color: 'gold', level: 1, max: 1, evolution: true, weapon: !!e.weapon });
      break;
    }
  }
  const pool = UPGRADES.filter((u) => (lv[u.id] || 0) < u.max);
  const going = EVOLUTIONS.filter((e) => live(run, e));
  // weight toward upgrades that lead to an evolution the player has started (its other part is picked up, and
  // more so when that part is maxed, so this card finishes the job); a gun's evolution counts once the gun is found
  const weight = (u) => {
    let w = 1;
    for (const e of going) {
      if (!e.needs.includes(u.id)) continue;
      const others = e.needs.filter((id) => id !== u.id);
      if (others.some((id) => (lv[id] || 0) > 0)) w += 0.8;
      if (others.every((id) => UP[id] && (lv[id] || 0) >= UP[id].max)) w += 0.6;
    }
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
