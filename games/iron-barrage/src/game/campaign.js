// The campaign: fifteen missions, three on each of five battlefields, in
// order. Each has a briefing, the enemy tanks (type, skill, stock and
// upgrades), a reward, and the round limit for its third star. Also here:
// how a battle turns into stars and money, and the set-ups that main.js
// hands to Battle for campaign and quick battles.
import { WEAPONS, starterKit } from './weapons.js';
import { LEVEL_IDS } from './ai.js';
import { BATTLEFIELDS } from '../world/battlefields.js';
import * as P from './progress.js';

// The five battlefields of the campaign. `sky` and `ridge` colour the map
// cards only; the real looks live in world/battlefields.js under the same id.
export const THEATRES = [
  { id: 'ashfield', name: 'Ashfield', place: 'Burnt farmland at dawn', blurb: 'Open fields, a low ridge across the middle and smoke on the horizon.', sky: ['#33405c', '#c9724a', '#f0a868'], ground: '#2b2118' },
  { id: 'dunes', name: 'Red Dunes', place: 'Desert at noon', blurb: 'Heat haze over shifting sand. No cover and no shade.', sky: ['#5a86a8', '#d9b783', '#f0d9a6'], ground: '#5a3a22' },
  { id: 'frostline', name: 'Frostline', place: 'Winter forest in snowfall', blurb: 'Dark pines and falling snow. Sound dies in the drifts.', sky: ['#59616b', '#a3adb6', '#d4dce2'], ground: '#a9b2b8' },
  { id: 'ruins', name: 'Old Town', place: 'Bombed city at dusk, in the rain', blurb: 'Broken towers and wet rubble. The street is a shooting gallery.', sky: ['#2c2a3b', '#6d4a52', '#b0745a'], ground: '#1d1c1e' },
  { id: 'nightfall', name: 'Black Ridge', place: 'Rocky ridge at night', blurb: 'Flares, long shadows and a long way down.', sky: ['#070b14', '#121a2c', '#26324a'], ground: '#15171a' },
];
export const THEATRE = Object.fromEntries(THEATRES.map((t) => [t.id, t]));

const CALLSIGNS = ['Viper', 'Jackal', 'Kestrel', 'Mamba', 'Wolfhound', 'Raptor', 'Sabre', 'Cobra', 'Hyena', 'Talon', 'Anvil', 'Harrier', 'Corvus', 'Basilisk', 'Warhawk', 'Gorgon'];

// n, field, name, brief, enemy types, skill, enemy stock, enemy upgrades,
// reward, round limit (third star).
const T = (n, field, name, brief, types, level, kit, up, reward, rounds) => ({
  n,
  field,
  name,
  brief,
  level,
  kit,
  up,
  reward,
  rounds,
  enemies: types.map((type, i) => ({ type, name: CALLSIGNS[(n * 3 + i * 5) % CALLSIGNS.length] })),
});

export const MISSIONS = [
  T(1, 'ashfield', 'First Light', 'One tank on the far ridge, alone. Find the range and walk your shots in.', ['warden'], 'recruit', {}, {}, 140, 8),
  T(2, 'ashfield', 'Road Screen', 'A light tank screens the farm road. Fast and thin-skinned. Hit it before it closes.', ['lynx'], 'recruit', { heavy: 1 }, {}, 160, 8),
  T(3, 'ashfield', 'Burnt Farmstead', 'Two tanks dug in at the farmstead. Kill the light tank first.', ['warden', 'lynx'], 'recruit', { heavy: 1, cluster: 1 }, {}, 200, 12),
  T(4, 'dunes', 'Dry Run', 'Heavy armour on the dune crest. Thick hull: use the big rounds and watch the wind.', ['bulwark'], 'regular', { heavy: 2 }, {}, 220, 9),
  T(5, 'dunes', 'Mirage Line', 'Two tanks working the heat haze. They shoot first if you let them.', ['lynx', 'warden'], 'regular', { heavy: 2, cluster: 1 }, {}, 260, 12),
  T(6, 'dunes', 'Salt Flat', 'A medium and a heavy cover the flat. No cover for either side.', ['warden', 'bulwark'], 'regular', { heavy: 2, cluster: 1, napalm: 1 }, {}, 300, 12),
  T(7, 'frostline', 'Cold Start', 'Snow on the treeline. Two mediums, patient and accurate. Snow hides the fall of shot.', ['warden', 'warden'], 'regular', { heavy: 2, cluster: 2, missile: 1 }, {}, 320, 12),
  T(8, 'frostline', 'Whiteout', 'Visibility nil. A heavy and a light tank move under the snowfall.', ['lynx', 'bulwark'], 'veteran', { heavy: 2, cluster: 1, napalm: 1 }, { armour: 1 }, 360, 12),
  T(9, 'frostline', 'Black Ice', 'Three tanks around the frozen creek. Keep moving. Stationary targets die.', ['warden', 'lynx', 'lynx'], 'veteran', { heavy: 2, cluster: 2, missile: 1 }, {}, 420, 16),
  T(10, 'ruins', 'Broken Street', 'An armoured pair holds the old town. Rubble is cover until it is not.', ['bulwark', 'warden'], 'veteran', { heavy: 3, cluster: 2, napalm: 1 }, { armour: 1 }, 440, 12),
  T(11, 'ruins', 'Rain on Slate', 'Three hulls shell the main street through the downpour. Rain muffles the wind too.', ['warden', 'bulwark', 'lynx'], 'veteran', { heavy: 3, cluster: 2, missile: 1, shield: 1 }, { hull: 1 }, 480, 16),
  T(12, 'ruins', 'Last Light', 'Dusk at the river crossing. Three veteran crews, one chance to cross.', ['bulwark', 'lynx', 'warden'], 'veteran', { heavy: 3, cluster: 2, airstrike: 1, repair: 1 }, { armour: 1, hull: 1 }, 540, 16),
  T(13, 'nightfall', 'Flare Path', 'Night. Flares up. Elite crews hold the high ground. Expect to be found.', ['warden', 'bulwark'], 'elite', { heavy: 3, cluster: 2, missile: 1, shield: 1 }, { armour: 1, hull: 1 }, 560, 12),
  T(14, 'nightfall', 'Long Shadow', 'Three tanks, two of them heavy, dug into the rock. They know the range.', ['bulwark', 'warden', 'bulwark'], 'elite', { heavy: 3, cluster: 2, airstrike: 1, sabot: 1, repair: 1 }, { armour: 1, hull: 2, gun: 1 }, 620, 16),
  T(15, 'nightfall', 'Iron Barrage', 'The last strongpoint. Three elite hulls, armoured and fully stocked. End it.', ['bulwark', 'bulwark', 'warden'], 'elite', { heavy: 4, cluster: 3, napalm: 1, airstrike: 1, missile: 2, sabot: 1, shield: 1, repair: 1 }, { armour: 2, hull: 2, gun: 1, engine: 1 }, 750, 16),
];

// Field notes shown on some briefings, so the game teaches as it goes.
const TIPS = {
  1: 'Drag on the battlefield to aim: the gun points at your finger and the distance sets the power. The wind bar shows which way every shell will drift, and your last impact stays marked, so walk your shots in.',
  2: 'Light tanks reposition between shots. Fire when it has stopped, and use the mark left by your last shell to correct.',
  4: 'Heavy shells bite deeper and the wind pushes them less. Save them for armour.',
  5: 'Cluster bombs burst above open ground. Best when two tanks stand close together.',
  7: 'The wind changes between turns. Read it again every time before you fire.',
  8: 'You can drive. Moving after each shot makes you a harder target and opens new angles.',
  10: 'Craters hide tanks and rubble breaks a shell. A steep, high shot drops in behind cover.',
  13: 'Elite crews bracket you in two or three rounds. Keep moving, and do not sit where they already fired.',
};
export const tipFor = (n) => TIPS[n] || null;

export const TOTAL_STARS = MISSIONS.length * 3;
export const mission = (n) => MISSIONS[n - 1] || null;
export const missionsOf = (field) => MISSIONS.filter((m) => m.field === field);
export const isLast = (n) => n >= MISSIONS.length;

export function unlocked(n) {
  return n <= 1 || !!P.missionRecord(n - 1);
}

// The mission to play next: the first not yet cleared (the last, if all are).
export function currentMission() {
  for (const m of MISSIONS) if (!P.missionRecord(m.n)) return m.n;
  return MISSIONS.length;
}

export const levelIndex = (level) => Math.max(0, LEVEL_IDS.indexOf(level));

// Only weapons the game actually has, whatever weapons.js holds today.
function kit(spec) {
  const out = { shell: Infinity };
  for (const [id, n] of Object.entries(spec || {})) if (WEAPONS[id] && id !== 'shell') out[id] = n;
  return out;
}

// Each mission keeps the same land every time (so a retry is a retry):
// the battlefield's own seed, nudged by the mission's place on that front.
function seedFor(m) {
  const bf = BATTLEFIELDS[m.field] || BATTLEFIELDS.ashfield;
  const k = missionsOf(m.field).indexOf(m);
  return bf.seed + k * 17;
}

export function missionSetup(m) {
  const d = P.data;
  return {
    mode: 'campaign',
    mission: m.n,
    battlefield: m.field,
    seed: seedFor(m),
    player: { type: d.tank, upgrades: { ...d.upgrades }, inventory: P.playerInventory() },
    enemies: m.enemies.map((e) => ({ name: e.name, type: e.type, level: m.level, inventory: kit(m.kit), upgrades: { ...m.up } })),
  };
}

const NAMES = ['Viper', 'Jackal', 'Kestrel', 'Mamba', 'Wolfhound', 'Raptor', 'Sabre', 'Cobra', 'Hyena', 'Talon'];
const TYPES = ['warden', 'lynx', 'bulwark'];

// A quick battle: your own tank and upgrades, but a fixed kit (your stock is
// neither used nor spent).
export function quickSetup(field, tank, count, level) {
  const names = [...NAMES].sort(() => Math.random() - 0.5);
  const d = P.data;
  return {
    mode: 'quick',
    battlefield: field,
    player: { type: tank, upgrades: { ...d.upgrades }, inventory: P.quickKit() },
    enemies: Array.from({ length: count }, (_, i) => ({ name: names[i], type: TYPES[(i + (level === 'elite' ? 2 : 0)) % 3], level, inventory: starterKit() })),
  };
}

// ---- stars and money
export const STAR_TEXT = (m) => ['Win the battle', 'Win with more than half your health left', `Win within ${m.rounds} rounds`];

export function starsFor(m, win, hpFrac, round) {
  if (!win || !m) return [false, false, false];
  return [true, hpFrac > 0.5, round <= m.rounds];
}

// The payout for a finished battle, line by line.
// o: { win, mission (or null), level, count, st {kills,damage,shots,hits}, firstClear, newStars }
export function earnings(o) {
  const lines = [];
  const li = levelIndex(o.level);
  const { st } = o;
  const acc = st.shots ? st.hits / st.shots : 0;
  if (o.win) {
    if (o.mission) {
      const full = o.firstClear ? o.mission.reward : Math.round(o.mission.reward * 0.4);
      lines.push({ label: o.firstClear ? 'Mission reward' : 'Mission reward (repeat)', amount: full });
    } else {
      lines.push({ label: 'Victory bonus', amount: Math.round((50 + 30 * li) * (0.6 + 0.4 * o.count)) });
    }
  }
  const dmg = Math.floor(st.damage * (o.win ? 0.6 : 0.35));
  if (dmg > 0) lines.push({ label: 'Damage dealt', note: `${st.damage}`, amount: dmg });
  const kill = Math.round(st.kills * (30 + 10 * li) * (o.win ? 1 : 0.5));
  if (kill > 0) lines.push({ label: 'Kills', note: `${st.kills}`, amount: kill });
  if (o.win && st.shots >= 3 && acc > 0.3) lines.push({ label: 'Accuracy bonus', note: `${Math.round(acc * 100)}%`, amount: Math.round((Math.min(acc, 0.9) - 0.3) * 120) });
  if (o.newStars > 0) lines.push({ label: o.newStars === 1 ? 'New star' : 'New stars', note: `${o.newStars}`, amount: o.newStars * 50 });
  if (!o.win) lines.push({ label: 'Field pay', amount: 25 });
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}
