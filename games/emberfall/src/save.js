// Emberfall save: one slot in localStorage under 'emberfall.save'. The saved
// object is G.prog flattened with { version, savedAt } so tests can read it
// directly. loadSave validates every field and returns a clean prog or null:
// corrupt, foreign or old data never throws and never reaches the game.
// completion() is the one place the completion % is worked out (title, map, ending).
import { ABILITIES, BOSSES } from './config.js';

export const SAVE_KEY = 'emberfall.save';
export const SAVE_VERSION = 1;

// Rooms of the loaded world, so a save naming a room that no longer exists is
// dropped. The interface registers G.world (knowRooms) the first time it draws.
let rooms = null;
export function knowRooms(world) { if (world?.rooms) rooms = world.rooms; }

export function saveGame(G) {
  const data = { ...JSON.parse(JSON.stringify(G.prog)), version: SAVE_VERSION, savedAt: Date.now() };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode or full: play on */ }
  return data;
}

export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

// Raw read (with savedAt), or null.
export function readSave() {
  let raw;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  try { return clean(JSON.parse(raw)); } catch { return null; }
}
// The saved progress (a fresh object every call), or null.
export function loadSave(world) {
  if (world) knowRooms(world);
  const s = readSave();
  if (!s) return null;
  const { version, savedAt, ...prog } = s;
  return prog;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const flags = (v, keep = () => true) => {
  const out = {};
  if (isObj(v)) for (const k of Object.keys(v)) if (v[k] === true && typeof k === 'string' && k.length < 200 && keep(k)) out[k] = true;
  return out;
};
function clean(d) {
  if (!isObj(d) || d.version !== SAVE_VERSION) return null;
  let cp = null;
  if (d.checkpoint != null) {
    const c = d.checkpoint;
    if (!isObj(c) || typeof c.room !== 'string' || !Number.isFinite(c.x) || !Number.isFinite(c.y)) return null;
    if (rooms && !rooms[c.room]) return null;
    cp = { room: c.room, x: c.x, y: c.y };
  }
  return {
    version: d.version, savedAt: num(d.savedAt, 0, 1e15, 0),
    abilities: flags(d.abilities, (k) => ABILITIES.includes(k)),
    bosses: flags(d.bosses, (k) => k in BOSSES),
    taken: flags(d.taken), opened: flags(d.opened), lore: flags(d.lore),
    visited: flags(d.visited, (k) => !rooms || k in rooms),
    maxHp: Math.round(num(d.maxHp, 1, 20, 5)), shards: Math.round(num(d.shards, 0, 1e9, 0)),
    checkpoint: cp, deaths: Math.round(num(d.deaths, 0, 1e9, 0)), time: num(d.time, 0, 1e9, 0),
  };
}

// Completion of a run: abilities, bosses, vessels, secret rooms visited and
// rooms visited, each a share of 100. Returns the parts too (for the map and ending).
export function completion(prog, world) {
  const defs = world?.rooms ? Object.entries(world.rooms) : [];
  let vessels = 0, vesselsTaken = 0, secrets = 0, secretsFound = 0;
  for (const [id, def] of defs) {
    if (def.secret) { secrets++; if (prog.visited?.[id]) secretsFound++; }
    (def.ents || []).forEach((e, i) => { if (e.t === 'vessel') { vessels++; if (prog.taken?.[id + '#' + i]) vesselsTaken++; } });
  }
  const rooms = defs.length, roomsSeen = defs.filter(([id]) => prog.visited?.[id]).length;
  const abil = ABILITIES.filter((id) => prog.abilities?.[id]).length;
  const boss = Object.keys(BOSSES).filter((id) => prog.bosses?.[id]).length;
  const parts = [[abil, ABILITIES.length, 25], [boss, 4, 20], [vesselsTaken, vessels, 15], [secretsFound, secrets, 10], [roomsSeen, rooms, 30]];
  let got = 0, of = 0;
  for (const [a, n, w] of parts) if (n) { got += w * a / n; of += w; }
  return {
    pct: of ? Math.floor(100 * got / of) : 0,
    abilities: [abil, ABILITIES.length], bosses: [boss, 4], vessels: [vesselsTaken, vessels],
    secrets: [secretsFound, secrets], rooms: [roomsSeen, rooms],
  };
}
