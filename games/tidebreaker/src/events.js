// A tiny event bus so the sim can tell sound, effects and the interface what
// happened without importing them. Handlers must never change sim state that
// affects the outcome (the sim stays deterministic without them).
//
// Events (data fields):
//   fire        { side: 'player'|'enemy', kind, x, y, n }   a gun or ability fired
//   hit         { x, y, dmg, crit, weak, kind, target }      damage landed
//   splash      { x, y, size }                               a ball fell in the sea
//   explode     { x, y, size }
//   sink        { x, y, kind, boss }                         a ship or set piece destroyed
//   player-hit  { dmg, x, y }
//   kraken      { x, y, n }                                  the Kraken ally rises
//   wave        { wave, waves }                              a new wave of a fleet
//   ability     { id }                                       chain fire lightning kraken
//   lightning   { x0, y0, x1, y1 }                           the Lightning Masts ability
//   thunder     { near }                                     weather, 0..1
//   coin        { n, x, y }
//   boss-spawn  { kind }  boss-phase { kind, phase }  boss-roar { kind }  boss-dead { kind }
//   leg         { leg, biome, name }   cleared {}   cards {}   card-pick { id, rarity }
//   reroll {}  won {}  lost {}  ui { action }  hover { id }
const subs = new Map();
export function on(type, fn) { if (!subs.has(type)) subs.set(type, []); subs.get(type).push(fn); }
export function off(type, fn) { const l = subs.get(type); if (l) subs.set(type, l.filter((f) => f !== fn)); }
export function emit(type, data = {}) {
  const l = subs.get(type); if (!l) return;
  for (const fn of l) { try { fn(data); } catch (e) { console.error(e); } }
}
