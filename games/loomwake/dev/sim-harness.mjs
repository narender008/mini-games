// Headless run of the whole sim with the autopilot: node games/loomwake/dev/sim-harness.mjs [seed] [minutes]
// Prints chambers, regions, deaths, doors/offers and checks reload determinism.
import { createGame } from '../src/state.js';
import { DT, BASE_STATS } from '../src/config.js';
// until the stats runtime defaults these (reported to powers)

import * as World from '../src/sim/world.js';
import * as Combat from '../src/sim/combat.js';
import * as Boons from '../src/sim/boons.js';
import * as Enemies from '../src/sim/enemies/index.js';
import * as Bosses from '../src/sim/bosses/index.js';
import * as Run from '../src/sim/run.js';
import { botTick } from '../src/sim/bot.js';
import { memoryStore } from '../src/save/save.js';

export function makeSim(seed = 1, store = memoryStore()) {
  const G = createGame({ seed });
  Combat.setBoonRuntime(Boons);
  World.setSystems({ updateFoes: Enemies.updateFoes, updateBosses: Bosses.updateBosses });
  Run.boot(G, { store, search: '?debug', now: () => 1700000000000 + Math.round(G.t * 1000) });
  return G;
}
export function step(G, n = 1, bot = true) {
  for (let i = 0; i < n; i++) {
    G.t += DT;
    if (bot) botTick(G);
    if ((G.scene === 'run' || G.scene === 'hub') && !G.paused) World.stepWorld(G, DT);
    Run.tick(G, DT);
    if (G.input) for (const k of Object.keys(G.input)) if (k.endsWith('P')) G.input[k] = false;
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const seed = +(process.argv[2] || 7), minutes = +(process.argv[3] || 10);
  const G = makeSim(seed);
  Run.newGame(G, 0, { wipe: true });
  const log = [];
  G.bus.on('scene', (p) => { if (p.to !== 'boons' && p.to !== 'dialogue' && p.from !== 'boons' && p.from !== 'dialogue') log.push(`${G.t.toFixed(1)} scene ${p.from}->${p.to}`); });
  G.bus.on('chamberEnter', (p) => { const c = p.chamber; if (G.run) log.push(`${G.t.toFixed(1)} enter ${c.region}:${c.index} ${c.kind} hp=${Math.round(G.hero.hp)}/${G.hero.maxHp} boons=${G.run.boons.length} doors=${(c.doors || []).map((d) => d.reward && d.reward.kind).join(',')}`); });
  G.bus.on('runEnd', (p) => log.push(`${G.t.toFixed(1)} RUN END ${p.result} ${p.killer || ''}`));
  G.bus.on('bossDefeat', (p) => log.push(`${G.t.toFixed(1)} BOSS DOWN ${p.id}`));
  const steps = minutes * 60 * 120;
  let err = 0;
  for (let i = 0; i < steps; i++) {
    try { step(G, 1); } catch (e) { if (err++ < 5) console.error('step error', e); }
  }
  console.log(log.join('\n'));
  console.log('final scene', G.scene, 'meta stats', JSON.stringify(G.meta.stats).slice(0, 400));
}
