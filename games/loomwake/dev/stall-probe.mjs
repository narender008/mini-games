// Stall probe: node games/loomwake/dev/stall-probe.mjs <seed> <minutes> — prints state every sim minute.
import { makeSim, step } from './sim-harness.mjs';
import * as Run from '../src/sim/run.js';
const seed = +(process.argv[2] || 2), minutes = +(process.argv[3] || 30);
const G = makeSim(seed);
Run.newGame(G, 0, { wipe: true });
for (let m = 0; m < minutes; m++) {
  for (let i = 0; i < 60 * 120; i++) step(G, 1);
  const ch = G.run && G.run.ch, c = G.chamber, h = G.hero;
  console.log(m + 1, G.scene, G.run ? `${G.run.region}:${G.run.chamber} ${c && c.template} ${G.run.kind}` : '-',
    ch ? `cl=${ch.cleared} rd=${ch.rewardDone} wave=${ch.wave}` : '', `foes=${(G.foes || []).filter((f) => !f.dead).length}`,
    `boss=${G.boss && G.boss.id}`, `pick=${(G.pickups || []).length}`, `hero=${Math.round(h.x)},${Math.round(h.y)} ${h.state} hp${Math.round(h.hp)}`,
    `bot=${G.bot && G.bot.mode}`, `prompt=${G.prompt && (G.prompt.id || G.prompt.kind || JSON.stringify(G.prompt).slice(0, 60))}`, `paused=${G.paused}`, `ui=${G.ui && G.ui.station}`);
}
