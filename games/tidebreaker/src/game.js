// Tidebreaker: the run. Owns the game state G, the scene flow (title, play,
// cards, paused, won, lost, shop) and the voyage (5 legs x 3 nodes), and calls
// each system's update in a fixed order. Systems never import this file: they
// get G passed in and talk back through G and the event bus (events.js).
//
// ---------------------------------------------------------------- the state
// G = {
//   scene: 'title'|'play'|'cards'|'paused'|'won'|'lost'|'shop',
//   t:  sim seconds in this run (advances only in 'play'),
//   vt: visual seconds (always advances; waves, clouds, flags use this),
//   rng: seeded () => [0,1) for everything that changes the outcome,
//   leg: 0..4, node: 0..2, stage: leg * 3 + node (0..14), diff: difficulty multiplier (1 at stage 0),
//   legDef: LEGS[leg],
//   world: owned by world/*.js { biome, scroll, ..., light: { rim, sailLit, glint, dark 0..1, fog 0..1 } }
//         light is the current (blended) lighting other painters use for rims and lit sails,
//   lane: { y, amp, ph, sp } the swell ships ride on, set by world.setBiome; world/ocean.js laneY(G, x),
//   input: { aim: {x, y}, fire, fireTap, move: -1..1, steerTo: x|null, ability: id|null }  (set each step),
//   player: ship entity (ships.js makePlayer) plus { cd: { broadside, chain, fire, lightning, kraken } },
//   stats: computed player stats (upgrades.js computeStats, see BASE_STATS in config.js),
//   enemies: [entity], allies: [entity], shots: [shot] (combat.js), fx: [particle] (world/fx.js),
//   enc: the current encounter { type: 'fleet'|'fortress'|'serpent'|'leviathan', done, wave, waves, ... },
//   boss: null | { kind, name, hp, maxHp, phase, phases, x, y } (the bar at the top and the aim point
//         for bots, the weak spot when open; boss.js keeps it current),
//   shots: { side: 'player'|'enemy', kind, x, y, vx, vy, landX (where it will meet the lane), ... },
//   run: { gold, score, kills, shots, dmg, upgrades: { id: rank }, picks: [id], rerolls, started },
//   meta: saved progress (save.js), cards: null | { ids: [id], hover }, banner: null | { title, sub, t, life },
//   ui: { hover: button id | null }, god: false, auto: false
// }
//
// --------------------------------------------------------- entity contract
// Everything that can be hit (enemy ships, the fortress, boss parts) lives in
// G.enemies; the player is G.player; Kraken tentacles live in G.allies.
// {
//   kind, x, y (waterline anchor), cx, cy (aim point, centre of mass),
//   hp, maxHp, alive (false once destroyed), gone (true: remove from the list),
//   layer: 'far' | 'lane' | 'front' (draw order, see main.js render),
//   boss: bool, bounty: gold on kill, burn, burnDps, slow (seconds of status left),
//   hitTest(x, y, r) -> 0 for a miss, else a damage multiplier (2 on a weak spot),
//   update(G, dt), draw(g, G), onDamage?(G, amount, info), onDeath?(G)
// }
// combat.js damage(G, target, amount, info) is the only way hp goes down.
import { LEGS, BASE_STATS, PLAYER_X, DEBUG } from './config.js';
import { rng } from './util.js';
import { emit } from './events.js';
import * as world from './world/weather.js';
import { updateFx } from './world/fx.js';
import { makePlayer, updatePlayer } from './ships.js';
import { playerControl, updateShots } from './combat.js';
import { startFleet, updateFleet } from './ai.js';
import { startBoss, updateBoss } from './boss.js';
import { computeStats, rollCards, applyUpgrade, UPGRADES } from './upgrades.js';
import { loadMeta, recordRun } from './save.js';

export function createGame(seed = (Math.random() * 2 ** 31) | 0) {
  const G = {
    scene: 'title', t: 0, vt: 0, seed, rng: rng(seed),
    leg: 0, node: 0, stage: 0, diff: 1, legDef: LEGS[0],
    world: {}, lane: { y: 540, amp: 12, ph: 0.4, sp: 1 },
    input: blankInput(),
    player: null, stats: { ...BASE_STATS },
    enemies: [], allies: [], shots: [], fx: [],
    enc: null, boss: null,
    run: null, meta: loadMeta(), cards: null, banner: null,
    ui: { hover: null }, god: false, auto: false, endT: 0, clearT: 0, resumeScene: 'play',
  };
  world.setBiome(G, 'sunset', true);
  return G;
}

export function blankInput() {
  return { aim: { x: 900, y: 470 }, fire: false, fireTap: false, move: 0, steerTo: null, ability: null };
}

// Start a new run. opts: { seed, leg (0-based), node, upgrades: { id: rank } }
export function newRun(G, opts = {}) {
  if (opts.seed != null) { G.seed = opts.seed | 0; }
  G.rng = rng(G.seed);
  G.t = 0; G.vt = 0; // the swell (laneY) runs on vt, so a run must start from the same sea
  G.run = { gold: 0, score: 0, kills: 0, shots: 0, dmg: 0, upgrades: {}, picks: [], rerolls: 0, started: Date.now(), time: 0 };
  for (const [id, rank] of Object.entries(opts.upgrades || {})) for (let i = 0; i < rank; i++) applyUpgrade(G, id);
  G.stats = computeStats(G.run, G.meta);
  G.enemies = []; G.allies = []; G.shots = []; G.fx = [];
  G.player = makePlayer(G);
  G.player.x = PLAYER_X.start;
  G.player.hp = G.player.maxHp = G.stats.maxHull;
  G.boss = null; G.cards = null; G.endT = 0; G.clearT = 0;
  G.leg = Math.max(0, Math.min(4, opts.leg ?? 0));
  G.node = Math.max(0, Math.min(2, opts.node ?? 0));
  G.scene = 'play';
  startNode(G, true);
}

function startNode(G, newLeg) {
  G.legDef = LEGS[G.leg];
  G.stage = G.leg * 3 + G.node;
  G.diff = 1 + G.stage * 0.16;
  if (newLeg) {
    world.setBiome(G, G.legDef.biome, G.t === 0);
    if (G.t === 0) G.lane.t = 0;
    G.banner = { title: G.legDef.name, sub: `LEG ${G.leg + 1} OF ${LEGS.length}`, t: 0, life: 3.2 };
    emit('leg', { leg: G.leg, biome: G.legDef.biome, name: G.legDef.name });
  }
  const type = G.legDef.nodes[G.node];
  G.enemies = G.enemies.filter((e) => !e.alive && !e.gone); // let wrecks finish sinking
  G.shots = G.shots.filter((s) => s.side === 'player');
  G.boss = null; G.clearT = 0;
  if (type === 'fleet') startFleet(G);
  else startBoss(G, type);
}

// One fixed simulation step.
export function step(G, dt) {
  G.vt += dt;
  world.updateWorld(G, dt);
  updateFx(G, dt);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.life) G.banner = null; }
  if (G.scene !== 'play') return;

  G.t += dt; G.run.time = G.t;
  const p = G.player;
  updatePlayer(G, dt);
  if (p.alive) playerControl(G, dt);
  for (const e of G.enemies) e.update(G, dt);
  for (const a of G.allies) a.update(G, dt);
  updateShots(G, dt);
  if (G.enc.type === 'fleet') updateFleet(G, dt); else updateBoss(G, dt);
  G.enemies = G.enemies.filter((e) => !e.gone);
  G.allies = G.allies.filter((a) => !a.gone);
  G.input.fireTap = false; G.input.ability = null;

  if (!p.alive) {
    G.endT += dt;
    if (G.endT > 2.6) endRun(G, false);
    return;
  }
  if (G.enc.done) {
    if (G.clearT === 0) { emit('cleared', {}); G.banner = { title: G.enc.type === 'fleet' ? 'FLEET SUNK' : 'VICTORY', sub: '', t: 0, life: 1.6 }; }
    G.clearT += dt;
    if (G.clearT > 1.8) {
      if (G.leg === LEGS.length - 1 && G.node === 2) endRun(G, true);
      else openCards(G);
    }
  }
}

export function openCards(G) {
  G.cards = { ids: rollCards(G, G.stats.cards), hover: -1 };
  G.scene = 'cards';
  G.shots = []; G.clearT = 0;
  emit('cards', {});
}

function nextNode(G) {
  G.cards = null;
  // a little repair between fights
  G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.2);
  let newLeg = false;
  G.node++;
  if (G.node > 2) { G.node = 0; G.leg++; newLeg = true; G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.2); }
  // the crew patches the hull properly before the final battle
  if (LEGS[G.leg]?.nodes[G.node] === 'leviathan') G.player.hp = G.player.maxHp;
  G.scene = 'play';
  startNode(G, newLeg);
}

function endRun(G, won) {
  G.scene = won ? 'won' : 'lost';
  G.result = recordRun(G, won);
  emit(won ? 'won' : 'lost', {});
}

export function chooseCard(G, i) {
  if (G.scene !== 'cards' || !G.cards) return false;
  if (typeof i === 'string') i = G.cards.ids.indexOf(i);
  const id = G.cards.ids[i];
  if (!id) return false;
  applyUpgrade(G, id);
  const maxBefore = G.player.maxHp;
  G.stats = computeStats(G.run, G.meta);
  G.player.maxHp = G.stats.maxHull;
  if (G.player.maxHp > maxBefore) G.player.hp += G.player.maxHp - maxBefore;
  emit('card-pick', { id, rarity: UPGRADES[id]?.rarity });
  nextNode(G);
  return true;
}

// Interface actions from buttons, keys and the debug hook.
export function act(G, action, arg) {
  emit('ui', { action });
  switch (action) {
    case 'start': newRun(G, { seed: DEBUG ? G.seed : (Math.random() * 2 ** 31) | 0 }); break;
    case 'restart': newRun(G, { seed: DEBUG ? G.seed : (Math.random() * 2 ** 31) | 0 }); break;
    case 'menu': G.scene = 'title'; G.enemies = []; G.shots = []; G.allies = []; G.boss = null; G.cards = null; world.setBiome(G, 'sunset'); break;
    case 'shop': G.scene = 'shop'; break;
    case 'pick': chooseCard(G, arg); break;
    case 'reroll':
      if (G.scene === 'cards' && G.run.gold >= G.stats.rerollCost) {
        G.run.gold -= G.stats.rerollCost; G.run.rerolls++;
        G.cards = { ids: rollCards(G, G.stats.cards), hover: -1 };
        emit('reroll', {});
      }
      break;
    case 'skip': if (G.scene === 'cards') { G.run.gold += 80; emit('coin', { n: 80 }); nextNode(G); } break;
    case 'pause':
      if (G.scene === 'play' || G.scene === 'cards') { G.resumeScene = G.scene; G.scene = 'paused'; }
      else if (G.scene === 'paused') G.scene = G.resumeScene;
      break;
    case 'resume': if (G.scene === 'paused') G.scene = G.resumeScene; break;
    case 'ability': if (G.scene === 'play') G.input.ability = arg; break;
    case 'fire': if (G.scene === 'play') G.input.fireTap = true; break;
    default: break; // 'buy', 'mute' and the like are handled by save.js / main.js
  }
}
