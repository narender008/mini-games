// A tiny event bus so the sim can tell sound, effects and the interface what
// happened without importing them. Handlers must never change sim state that
// affects the outcome (the sim stays deterministic without them).
//
// Events (data fields). Add new ones here when you emit them.
//   jump { x, y, double }  land { x, y, v }  dash { x, y, dir }  wall-jump { x, y }
//   swing { x, y, dir }  bolt { x, y }  hook { x, y }  hook-pull { x, y }
//   fire-form { on }  splash { x, y, size }  crumble { x, y }  break { x, y } (a cracked wall)
//   burn { x, y } (a bramble burnt)
//   hit { x, y, dmg, target }  enemy-die { x, y, kind }  player-hit { dmg, x, y }
//   player-die { x, y }  respawn { room }
//   pickup { kind: 'ability'|'vessel'|'shard'|'lore', id, x, y }  ability { id }
//   shard { n, x, y }  save { room } (rested at a brazier)  gate { id, open }
//   room { id, biome, from }  biome { id, name }
//   boss-spawn { id }  boss-phase { id, phase }  boss-roar { id }  boss-dead { id }
//   shake { amp, t }  flash { color, a }
//   won {}  ui { action }  hover { id }
const subs = new Map();
export function on(type, fn) { if (!subs.has(type)) subs.set(type, []); subs.get(type).push(fn); }
export function off(type, fn) { const l = subs.get(type); if (l) subs.set(type, l.filter((f) => f !== fn)); }
export function emit(type, data = {}) {
  const l = subs.get(type); if (!l) return;
  for (const fn of l) { try { fn(data); } catch (e) { console.error(e); } }
}
