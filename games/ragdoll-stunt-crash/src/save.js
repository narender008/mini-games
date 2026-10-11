// What is kept between visits, on this device only (localStorage
// 'ragdoll-stunt-crash'): cash, the rides bought and the one picked for each
// kind of launch, garage upgrades, each track's best set and stars, and the
// settings. Every read and write is guarded, so the game still works with
// storage blocked (nothing is then kept).
import { RIDES } from './sim/defs.js';
import { DEBUG, REDUCED_MOTION } from './config.js';

const KEY = 'ragdoll-stunt-crash';

// Garage upgrades: what a level does, and its price (base times the next level).
export const UPGRADES = [
  { id: 'engine', name: 'Tuned Engine', max: 5, cost: 18000, text: (l) => `+${8 * l}% top speed for cars and ramp rides` },
  { id: 'powder', name: 'Extra Powder', max: 5, cost: 18000, text: (l) => `+${8 * l}% launch power for cannons and the slingshot` },
  { id: 'air', name: 'Stunt School', max: 3, cost: 25000, text: (l) => `${30 * l}% stronger flips when you tuck` },
  { id: 'bones', name: 'Brittle Bones', max: 3, cost: 30000, text: (l) => `Bones break and limbs tear ${10 * l}% sooner` },
  { id: 'insurance', name: 'Insurance Policy', max: 5, cost: 40000, text: (l) => `+${15 * l}% payout on every run` },
];

const fresh = () => ({
  v: 1,
  cash: 0,
  owned: ['hatchback', 'cart', 'circus'],
  ride: { car: 'hatchback', ramp: 'cart', cannon: 'circus' },
  upgrades: {},
  best: {},
  stars: {},
  cleared: {},
  runs: 0,
  earned: 0,
  settings: { volume: 0.8, music: 0.5, muted: false, quality: 'auto', shake: REDUCED_MOTION ? 'reduced' : 'full', gore: 'max', replay: true },
});

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const f = fresh();
    return { ...f, ...d, ride: { ...f.ride, ...(d.ride || {}) }, settings: { ...f.settings, ...(d.settings || {}) }, upgrades: { ...(d.upgrades || {}) } };
  } catch {
    return fresh();
  }
}

export const data = read();

// Nothing is written while ?debug is on, so testing never touches the real save.
export function save() {
  if (DEBUG) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage blocked or full: keep playing */
  }
}

// Progress starts over; the settings are kept.
export function reset() {
  const f = fresh();
  const settings = data.settings || f.settings;
  for (const k of Object.keys(data)) delete data[k];
  Object.assign(data, f, { settings });
  save();
}

export function level(id) {
  return data.upgrades[id] || 0;
}

export function upgradeCost(u) {
  const l = level(u.id);
  return l >= u.max ? null : u.cost * (l + 1);
}

export function buyUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return false;
  const c = upgradeCost(u);
  if (c === null || data.cash < c) return false;
  data.cash -= c;
  data.upgrades[id] = level(id) + 1;
  save();
  return true;
}

export function buyRide(id) {
  const r = RIDES[id];
  if (!r || data.owned.includes(id) || data.cash < r.cost) return false;
  data.cash -= r.cost;
  data.owned.push(id);
  data.ride[r.kind] = id;
  save();
  return true;
}

export function selectRide(id) {
  const r = RIDES[id];
  if (!r || !data.owned.includes(id)) return false;
  data.ride[r.kind] = id;
  save();
  return true;
}

// what a run starts with
export function runOptions(kind) {
  return {
    ride: data.ride[kind],
    speedMul: 1 + level('engine') * 0.08,
    powerMul: 1 + level('powder') * 0.08,
    air: level('air'),
    bones: level('bones'),
    payout: 1 + level('insurance') * 0.15,
  };
}
