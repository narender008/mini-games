// Save data and the armoury. One JSON blob under localStorage 'iron-barrage',
// kept on this device only, every read and write inside try/catch (private
// mode and blocked storage just mean nothing is remembered).
//
// `data` is the live object: main.js keeps a reference to it, so anything
// changed on it is saved by calling save(). Shape (version 1):
//   muted, lastField, quick{field,tank,count,level}      (first release, kept)
//   settings{quality:'auto'|'high'|'medium'|'low', calm (null = follow the OS reduced-motion setting), gore, music}
//   money                       funds
//   tank, tanks[]               the tank you field, and the ones you own
//   upgrades{armour,hull,engine,gun}   0..3 each, applied to whichever tank you field
//   stock{weaponId: n}          ammunition carried between campaign battles
//                               ('shell' is unlimited and never stored)
//   bought{weaponId: true}      specials you have bought at least once (quick
//                               battles hand out a few of each)
//   campaign{missions{n:{stars,got,rounds,hp,damage}}, done}   got = bit mask of the three stars, rounds/hp/damage = best
//   records{battles,wins,losses,kills,shots,hits,damage,rounds,bestShot,earned,...}
import { WEAPONS, starterKit } from './weapons.js';
import { TANK_TYPES } from './tank.js';

export const KEY = 'iron-barrage';
export const VERSION = 1;
export const MONEY_START = 100;
export const MAX_UPGRADE = 3;

// Upgrades: what each level does is applied by Tank (see tank.js).
export const UPGRADES = {
  armour: { name: 'Armour plate', blurb: 'Thicker plate turns away more of every hit.', per: '+5% of each hit resisted', prices: [250, 450, 750] },
  hull: { name: 'Hull strength', blurb: 'A reinforced hull and internal bracing: more hit points.', per: '+12% hit points', prices: [250, 450, 750] },
  engine: { name: 'Engine', blurb: 'A bigger engine: more fuel for the turn, and faster across the ground.', per: '+20% fuel, +8% speed', prices: [200, 350, 550] },
  gun: { name: 'Gun and charges', blurb: 'Hotter charges and a trued barrel: more muzzle velocity for the same power setting.', per: '+6% muzzle velocity', prices: [300, 500, 850] },
};
export const UPGRADE_KEYS = Object.keys(UPGRADES);

export const TANK_PRICES = { warden: 0, lynx: 500, bulwark: 900 };
export const tankPrice = (id) => TANK_PRICES[id] ?? 800;

const bits = (n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1);
const int = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

function fresh() {
  return {
    v: VERSION,
    muted: false,
    lastField: 'ashfield',
    quick: { field: 'ashfield', tank: 'warden', count: 1, level: 'regular' },
    settings: { quality: 'auto', calm: null, gore: true, music: true },
    money: MONEY_START,
    tank: 'warden',
    tanks: ['warden'],
    upgrades: { armour: 0, hull: 0, engine: 0, gun: 0 },
    stock: stockFromKit(starterKit()),
    bought: {},
    campaign: { missions: {}, done: false },
    records: { battles: 0, wins: 0, losses: 0, kills: 0, shots: 0, hits: 0, damage: 0, rounds: 0, bestShot: 0, earned: 0, missionWins: 0, quickWins: 0 },
  };
}

function stockFromKit(kit) {
  const out = {};
  for (const [id, n] of Object.entries(kit)) if (id !== 'shell' && Number.isFinite(n) && n > 0) out[id] = n;
  return out;
}

// Keeps what is valid in a stored blob and fills the rest from defaults, so a
// hand-edited, old or half-written save never breaks the game.
function sanitize(raw) {
  const d = fresh();
  if (!raw || typeof raw !== 'object') return d;
  if (typeof raw.muted === 'boolean') d.muted = raw.muted;
  if (typeof raw.lastField === 'string') d.lastField = raw.lastField;
  if (raw.quick && typeof raw.quick === 'object') {
    const q = raw.quick;
    if (typeof q.field === 'string') d.quick.field = q.field;
    if (typeof q.tank === 'string') d.quick.tank = q.tank;
    d.quick.count = int(q.count, 1, 3, 1);
    if (typeof q.level === 'string') d.quick.level = q.level;
  }
  const s = raw.settings;
  if (s && typeof s === 'object') {
    if (['auto', 'high', 'medium', 'low'].includes(s.quality)) d.settings.quality = s.quality;
    if (typeof s.calm === 'boolean') d.settings.calm = s.calm;
    if (typeof s.gore === 'boolean') d.settings.gore = s.gore;
    if (typeof s.music === 'boolean') d.settings.music = s.music;
  }
  if (raw.v === VERSION) {
    d.money = int(raw.money, 0, 1e9, d.money);
    if (Array.isArray(raw.tanks)) d.tanks = [...new Set(['warden', ...raw.tanks.filter((t) => typeof t === 'string')])];
    if (typeof raw.tank === 'string' && d.tanks.includes(raw.tank)) d.tank = raw.tank;
    for (const k of UPGRADE_KEYS) d.upgrades[k] = int(raw.upgrades?.[k], 0, MAX_UPGRADE, 0);
    if (raw.stock && typeof raw.stock === 'object') {
      d.stock = {};
      for (const [id, n] of Object.entries(raw.stock)) if (id !== 'shell') d.stock[id] = int(n, 0, 99, 0);
    }
    if (raw.bought && typeof raw.bought === 'object') for (const id of Object.keys(raw.bought)) if (raw.bought[id] === true) d.bought[id] = true;
    const c = raw.campaign;
    if (c && typeof c === 'object') {
      d.campaign.done = c.done === true;
      for (const [n, m] of Object.entries(c.missions || {})) {
        if (!m || typeof m !== 'object') continue;
        const got = int(m.got, 1, 7, 1);
        d.campaign.missions[n] = { stars: bits(got), got, rounds: int(m.rounds, 0, 999, 0), hp: Math.min(1, Math.max(0, Number(m.hp) || 0)), damage: int(m.damage, 0, 99999, 0) };
      }
    }
  }
  // the first release kept only these counters
  const r = raw.records;
  if (r && typeof r === 'object') for (const k of Object.keys(d.records)) d.records[k] = int(r[k], 0, 1e9, d.records[k]);
  return d;
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export const data = sanitize(read());

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode: nothing kept */
  }
}

// Wipes progress (money, tanks, upgrades, stock, campaign, records, the
// first-battle hints) and keeps the settings and the sound switch.
export function reset() {
  try {
    localStorage.removeItem('iron-barrage-coach'); // the first-battle hints start over too
  } catch {
    /* nothing kept anyway */
  }
  const keep = { muted: data.muted, settings: { ...data.settings }, lastField: data.lastField };
  for (const k of Object.keys(data)) delete data[k];
  Object.assign(data, fresh(), keep);
  save();
}

// A new campaign: the missions start over, your armoury stays.
export function newCampaign() {
  data.campaign = { missions: {}, done: false };
  save();
}

// ---- stock and the shop
export const specials = () => Object.values(WEAPONS).filter((w) => w.id !== 'shell');
export const packOf = (id) => {
  const a = WEAPONS[id]?.ammo;
  return Number.isFinite(a) && a > 0 ? a : 1;
};
export const stockCap = (id) => Math.max(6, packOf(id) * 3);
export const stockOf = (id) => data.stock[id] || 0;

// What your tank carries into a campaign battle.
export function playerInventory() {
  const inv = { shell: Infinity };
  for (const [id, n] of Object.entries(data.stock)) if (n > 0 && WEAPONS[id] && id !== 'shell') inv[id] = n;
  return inv;
}

// Reads the battle's remaining ammunition back into the stock.
export function takeBack(inventory) {
  const next = {};
  for (const id of Object.keys(WEAPONS)) {
    if (id === 'shell') continue;
    const n = inventory[id];
    if (Number.isFinite(n) && n > 0) next[id] = Math.min(99, Math.floor(n));
  }
  data.stock = next;
}

// Quick battles do not touch your stock: a fixed kit, with a few extra of
// every special you have bought before.
export function quickKit() {
  const kit = starterKit();
  for (const id of Object.keys(data.bought)) {
    if (!WEAPONS[id] || id === 'shell') continue;
    kit[id] = (kit[id] || 0) + Math.min(3, Math.max(1, Math.ceil(packOf(id) / 2)));
  }
  return kit;
}

// { ok, qty, cost } or { ok: false, reason }
export function buyAmmo(id) {
  const w = WEAPONS[id];
  if (!w || id === 'shell' || !(w.price > 0)) return { ok: false, reason: 'unavailable' };
  const have = stockOf(id);
  const room = stockCap(id) - have;
  if (room <= 0) return { ok: false, reason: 'full' };
  const pack = packOf(id);
  const qty = Math.min(pack, room);
  const cost = Math.ceil((w.price * qty) / pack);
  if (data.money < cost) return { ok: false, reason: 'money', cost };
  data.money -= cost;
  data.stock[id] = have + qty;
  data.bought[id] = true;
  save();
  return { ok: true, qty, cost };
}

export function buyUpgrade(key) {
  const u = UPGRADES[key];
  if (!u) return { ok: false, reason: 'unavailable' };
  const lv = data.upgrades[key];
  if (lv >= MAX_UPGRADE) return { ok: false, reason: 'maxed' };
  const cost = u.prices[lv];
  if (data.money < cost) return { ok: false, reason: 'money', cost };
  data.money -= cost;
  data.upgrades[key] = lv + 1;
  save();
  return { ok: true, cost, level: lv + 1 };
}

export function buyTank(id) {
  if (!TANK_TYPES[id]) return { ok: false, reason: 'unavailable' };
  if (data.tanks.includes(id)) return { ok: false, reason: 'owned' };
  const cost = tankPrice(id);
  if (data.money < cost) return { ok: false, reason: 'money', cost };
  data.money -= cost;
  data.tanks.push(id);
  data.tank = id;
  save();
  return { ok: true, cost };
}

export function selectTank(id) {
  if (!data.tanks.includes(id)) return false;
  data.tank = id;
  save();
  return true;
}

export const ownsTank = (id) => data.tanks.includes(id);

// ---- campaign progress
export const missionRecord = (n) => data.campaign.missions[n] || null;
export const starsTotal = () => Object.values(data.campaign.missions).reduce((s, m) => s + m.stars, 0);
export const missionsCleared = () => Object.keys(data.campaign.missions).length;
export const campaignStarted = () => missionsCleared() > 0;

// Keeps the best result per mission. got = [bool, bool, bool] for the three
// stars of this attempt. Returns how many stars are new.
export function recordMission(n, got, rounds, hp, damage) {
  const old = data.campaign.missions[n];
  const mask = (old ? old.got : 0) | (got[0] ? 1 : 0) | (got[1] ? 2 : 0) | (got[2] ? 4 : 0);
  data.campaign.missions[n] = {
    stars: bits(mask),
    got: mask,
    rounds: old ? Math.min(old.rounds || 999, rounds || 999) : rounds,
    hp: Math.max(old ? old.hp : 0, hp),
    damage: Math.max(old ? old.damage : 0, damage),
  };
  return data.campaign.missions[n].stars - (old ? old.stars : 0);
}

// ---- records
export function recordBattle(win, st, rounds, earned, bestShot) {
  const r = data.records;
  r.battles++;
  if (win) r.wins++;
  else r.losses++;
  r.kills += st.kills;
  r.shots += st.shots;
  r.hits += st.hits;
  r.damage += st.damage;
  r.rounds += rounds;
  r.earned += earned;
  r.bestShot = Math.max(r.bestShot, bestShot);
}
