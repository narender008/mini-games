// The simulation: clock plus every module's step, in a fixed order.
// Deterministic and headless: no DOM, canvas, audio, Date or Math.random here
// or in any module this imports. Node can import it (bots, balance runs).
import { DT, DAY } from '../config.js';
import * as islands from './islands.js';
import * as economy from './economy.js';
import * as links from './links.js';
import * as weather from './weather.js';
import * as raids from './raids.js';
import * as combat from './combat.js';
import * as defence from './defence.js';
import * as research from './research.js';
import * as fleet from './fleet.js';
import * as trade from './trade.js';
import * as chart from './chart.js';
import * as goals from './goals.js';

export const MODULES = { islands, economy, links, weather, raids, combat, defence, research, fleet, trade, chart, goals };
const INIT = [islands, economy, links, weather, research, fleet, trade, chart, raids, defence, combat, goals];
const STEP = [weather, links, economy, islands, fleet, trade, chart, research, raids, defence, combat, goals];

export function initSim(G) {
  G.tmp = G.tmp || {};
  for (const m of INIT) m.init?.(G);
  for (const m of INIT) m.hydrate?.(G);
}

export function hydrateSim(G) {
  G.tmp = {};
  for (const m of INIT) m.hydrate?.(G);
}

const PHASES = [[0.22, 'dawn'], [0.5, 'noon'], [0.76, 'dusk'], [0.88, 'night']];

// Advance exactly one fixed step.
export function tick(G) {
  const dt = DT;
  const prevTod = G.tod;
  G.t += dt;
  G.tod += dt / DAY;
  if (G.tod >= 1) { G.tod -= 1; G.day += 1; G.bus.emit('day', { day: G.day }); }
  for (const [at, phase] of PHASES) {
    if ((prevTod < at && G.tod >= at) || (prevTod > G.tod && G.tod >= at && at < 0.01)) G.bus.emit('tod', { phase });
  }
  for (const m of STEP) m.step?.(G, dt);
}

// Advance `seconds` of game time in fixed steps (carry the remainder on G.tmp).
export function advance(G, seconds) {
  G.tmp.acc = (G.tmp.acc || 0) + seconds;
  let n = 0;
  while (G.tmp.acc >= DT - 1e-9) { G.tmp.acc -= DT; tick(G); n++; }
  return n;
}

export function setSpeed(G, n) {
  n = Math.max(0, Math.min(3, n | 0));
  G.speed = n;
  G.bus.emit('ui:speed', { speed: n });
  return { ok: true };
}
