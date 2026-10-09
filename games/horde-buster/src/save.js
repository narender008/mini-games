// What is kept between runs, on this device only (localStorage
// 'horde-buster'): coins, armoury upgrades, weapons found, the starting gun,
// best results and settings. Every read and write is guarded, so the game
// still works with storage blocked (nothing is then kept).
const KEY = 'horde-buster';

export const ARMOURY = [
  { id: 'vitality', name: 'Vitality', icon: 'maxhp', max: 5, cost: 120, text: (l) => `+${10 * (l + 1)} max HP` },
  { id: 'firepower', name: 'Firepower', icon: 'damage', max: 5, cost: 150, text: (l) => `+${8 * (l + 1)}% damage` },
  { id: 'hands', name: 'Quick Hands', icon: 'cooldown', max: 4, cost: 140, text: (l) => `Abilities recharge ${8 * (l + 1)}% faster` },
  { id: 'magnetism', name: 'Magnetism', icon: 'magnet', max: 3, cost: 100, text: (l) => `+${20 * (l + 1)}% XP pickup range` },
  { id: 'lucky', name: 'Lucky Shot', icon: 'crit', max: 3, cost: 160, text: (l) => `+${3 * (l + 1)}% crit chance` },
  { id: 'bombs', name: 'Bandolier', icon: 'bombup', max: 2, cost: 300, text: (l) => `+${l + 1} bomb${l ? 's' : ''}` },
];

const fresh = () => ({
  v: 1,
  coins: 0,
  armoury: {},
  unlocked: ['blaster'],
  startWeapon: 'blaster',
  best: null,
  cleared: {},
  runs: 0,
  settings: { volume: 0.8, music: 0.6, muted: false, quality: 'auto', shake: 'full', numbers: true, gore: 'max' },
});

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const f = fresh();
    return { ...f, ...d, settings: { ...f.settings, ...(d.settings || {}) }, armoury: { ...(d.armoury || {}) } };
  } catch {
    return fresh();
  }
}

export const data = read();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage blocked or full: keep playing */
  }
}

export function cost(item) {
  const l = data.armoury[item.id] || 0;
  return l >= item.max ? null : item.cost * (l + 1);
}

export function buy(id) {
  const item = ARMOURY.find((a) => a.id === id);
  if (!item) return false;
  const c = cost(item);
  if (c === null || data.coins < c) return false;
  data.coins -= c;
  data.armoury[id] = (data.armoury[id] || 0) + 1;
  save();
  return true;
}

// what the run starts with
export function meta() {
  return { ...data.armoury, startWeapon: data.startWeapon };
}
