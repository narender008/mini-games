// Emberfall: the game. Owns the state G, the scene flow (title, play, paused,
// map, dead, won), progress (abilities, bosses, pickups, checkpoint) and calls
// each system's update in a fixed order. Systems never import this file
// except for the few progress helpers marked "systems may call"; they get G
// passed in and talk back through G and the event bus (events.js).
//
// ---------------------------------------------------------------- the state
// G = {
//   scene: 'title'|'play'|'paused'|'map'|'dead'|'won',
//   t:  sim seconds this session in 'play' (game time), vt: visual seconds (always runs),
//   rng: seeded () => [0,1) for everything that changes the outcome (seed G.seed),
//   world: static map, world/world.js loadWorld: { rooms: { id: def }, ids: [id], start: { room, x, y } },
//   room: the live room, world/world.js enterRoom:
//     { id, def, biome, gx, gy, tw, th (tiles), w, h (px), tiles: Uint8Array (codes, world/tiles.js),
//       ents: [world entity] (pickups, braziers, anchors, platforms, gates, lore: see world.js),
//       version (bumped whenever tiles change so the painter re-bakes), dark: 0..1 ambient darkness }
//   player: player.js makePlayer (x, y top-left of the hitbox in room px, w, h, vx, vy, ...; see player.js)
//   enemies: [enemy] (enemies/index.js), shots: [shot] (combat.js), fx: [particle] (render/fx.js),
//   lights: [{ x, y, r, c: '#rrggbb', a }] in room px, rebuilt every frame by the draw calls
//           (cleared by main.js before drawing; render/lighting.js consumes it),
//   cam: { x, y, sx, sy } room px of the screen's top-left plus shake (render/camera.js),
//   boss: null | { id, name, hp, maxHp, phase } kept current by the boss while a fight is on,
//   prog: saved progress (save.js writes exactly this) {
//     abilities: { id: true }, bosses: { id: true }, taken: { key: true } (pickups, 'room#index'),
//     opened: { key: true } (cracks, brambles broken for good: 'room:tx,ty'), visited: { room: true },
//     maxHp, shards, checkpoint: { room, x, y }, deaths, time (play seconds), lore: { key: true } },
//   input: { left, right, up, down, jump, attack, bolt, dash, hook, fire, interact (held),
//            jumpP, attackP, boltP, dashP, hookP, fireP, interactP (pressed this step),
//            aim: { x, y } | null (room px, from the mouse) }  set each step by input.js,
//   banner: null | { title, sub, t, life } (big centred text, ui draws it),
//   ui: { hover }, god: false, quality: 'high'|'low', prefs
// }
//
// --------------------------------------------------------- step order (play)
// input -> updatePlayer -> updateWorld (platforms, crumbles, pickups, transitions)
// -> updateEnemies (and the boss) -> updateCombat -> updateCamera
import { DEBUG, ABILITIES, ABILITY_NAMES, BOSSES, PHYS } from './config.js';
import { rng } from './util.js';
import { emit } from './events.js';
import { loadWorld, enterRoom, updateWorld, openDoors } from './world/world.js';
import { makePlayer, updatePlayer } from './player.js';
import { updateEnemies } from './enemies/index.js';
import { updateCombat } from './combat.js';
import { updateCamera, snapCamera } from './render/camera.js';
import { saveGame, loadSave } from './save.js';

export function createGame(seed = (Math.random() * 2 ** 31) | 0) {
  const G = {
    scene: 'title', t: 0, vt: 0, seed, rng: rng(seed),
    world: null, room: null, player: null,
    enemies: [], shots: [], fx: [], lights: [],
    cam: { x: 0, y: 0, sx: 0, sy: 0 }, boss: null,
    prog: freshProgress(), input: blankInput(),
    banner: null, ui: { hover: null }, god: false, deadT: 0, wonT: 0, resumeScene: 'play',
  };
  loadWorld(G);
  return G;
}

export function freshProgress(G) {
  return {
    abilities: {}, bosses: {}, taken: {}, opened: {}, visited: {}, lore: {},
    maxHp: 5, shards: 0, checkpoint: null, deaths: 0, time: 0,
  };
}

export function blankInput() {
  return {
    left: false, right: false, up: false, down: false, jump: false, attack: false, bolt: false,
    dash: false, hook: false, fire: false, interact: false,
    jumpP: false, attackP: false, boltP: false, dashP: false, hookP: false, fireP: false, interactP: false,
    aim: null,
  };
}

// Start a new game, or continue from progress. opts: { seed, prog, room, x, y }
export function startGame(G, opts = {}) {
  if (opts.seed != null) G.seed = opts.seed | 0;
  G.rng = rng(G.seed);
  G.prog = opts.prog ? { ...freshProgress(), ...opts.prog } : freshProgress();
  G.t = 0; G.boss = null; G.banner = null; G.shots = []; G.fx = [];
  const cp = G.prog.checkpoint;
  const room = opts.room || cp?.room || G.world.start.room;
  const at = opts.room ? (opts.x != null ? { x: opts.x, y: opts.y } : null) : cp ? { x: cp.x, y: cp.y } : { x: G.world.start.x, y: G.world.start.y };
  G.player = makePlayer(G);
  G.player.maxHp = G.prog.maxHp; G.player.hp = G.prog.maxHp;
  enterRoom(G, room, at);
  snapCamera(G);
  G.scene = 'play';
  if (!cp && !opts.room) G.banner = { title: 'Hollow Caves', sub: 'Find the light below', t: 0, life: 4 };
}

// Move to a room (debug teleport, respawn). at: { x, y } room px of the player's feet-left, or null for the room's entry.
export function gotoRoom(G, id, at = null) {
  G.boss = null; G.shots = [];
  enterRoom(G, id, at);
  snapCamera(G);
}

export function step(G, dt) {
  G.vt += dt;
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.life) G.banner = null; }
  if (G.scene === 'dead') {
    G.deadT += dt;
    if (G.deadT > 2.2) respawn(G);
    return;
  }
  if (G.scene === 'won') { G.wonT += dt; return; }
  if (G.scene !== 'play') return;
  G.t += dt; G.prog.time += dt;
  updatePlayer(G, dt);
  updateWorld(G, dt);
  updateEnemies(G, dt);
  updateCombat(G, dt);
  updateCamera(G, dt);
  if (G.player.hp <= 0 && G.scene === 'play') die(G);
}

// ------------------------------------------------------------ systems may call
export function hasAbility(G, id) { return !!G.prog.abilities[id]; }

export function grantAbility(G, id, quiet = false) {
  if (G.prog.abilities[id]) return;
  G.prog.abilities[id] = true;
  emit('ability', { id });
  if (!quiet) G.banner = { title: ABILITY_NAMES[id] || id, sub: ABILITY_HINTS[id] || '', t: 0, life: 4.5, kind: 'ability', id };
}
export const ABILITY_HINTS = {
  'twin-leap': 'Jump again in mid-air',
  'ember-dash': 'Shift or V to dash: shatters cracked stone',
  'root-grip': 'Slide down walls and leap off them',
  'chain-hook': 'E near a hook ring to swing across',
  'fire-form': 'F to burn bright: wade through lava, burn ember-thorns',
};

// A boss calls this once when its hp reaches 0 (after its death animation starts).
export function defeatBoss(G, id) {
  if (G.prog.bosses[id]) return;
  G.prog.bosses[id] = true;
  G.boss = null;
  openDoors(G);
  emit('boss-dead', { id });
  G.banner = { title: (BOSSES[id]?.name || id) + ' falls', sub: '', t: 0, life: 3.5, kind: 'boss' };
  // the reward ability (if any) is a pickup the boss room spawns once the boss is gone (world.js)
  if (id === 'cinder-king') { G.scene = 'won'; G.wonT = 0; emit('won', {}); }
  saveGame(G);
}

// Rest at a brazier: full flames, checkpoint, save.
export function rest(G, room, x, y) {
  G.prog.checkpoint = { room, x, y };
  G.player.hp = G.player.maxHp = G.prog.maxHp;
  saveGame(G);
  emit('save', { room });
}

export function addShards(G, n, x, y) { G.prog.shards += n; emit('shard', { n, x, y }); }
export function addVessel(G) { G.prog.maxHp += 1; G.player.maxHp = G.prog.maxHp; G.player.hp = G.player.maxHp; }

function die(G) {
  G.scene = 'dead'; G.deadT = 0; G.prog.deaths += 1;
  emit('player-die', { x: G.player.x, y: G.player.y });
}

export function respawn(G) {
  const cp = G.prog.checkpoint || { room: G.world.start.room, x: G.world.start.x, y: G.world.start.y };
  G.player = makePlayer(G);
  G.player.maxHp = G.prog.maxHp; G.player.hp = G.prog.maxHp;
  G.boss = null; G.shots = [];
  enterRoom(G, cp.room, { x: cp.x, y: cp.y });
  snapCamera(G);
  G.scene = 'play';
  emit('respawn', { room: cp.room });
}

// ------------------------------------------------------------ scene actions
export function act(G, action, arg) {
  emit('ui', { action });
  switch (action) {
    case 'new': startGame(G, {}); saveGame(G); break;
    case 'continue': { const s = loadSave(); if (s) startGame(G, { prog: s }); else startGame(G, {}); break; }
    case 'pause':
      if (G.scene === 'play') { G.resumeScene = 'play'; G.scene = 'paused'; }
      else if (G.scene === 'paused' || G.scene === 'map') G.scene = 'play';
      break;
    case 'resume': if (G.scene === 'paused' || G.scene === 'map') G.scene = 'play'; break;
    case 'map':
      if (G.scene === 'play' || G.scene === 'paused') G.scene = 'map';
      else if (G.scene === 'map') G.scene = 'play';
      break;
    case 'menu': if (G.scene !== 'title') { if (G.player && G.scene !== 'won') saveGame(G); G.scene = 'title'; } break;
    case 'rekindle': if (G.scene === 'dead') respawn(G); break;
    case 'confirm': G.ui.confirm = arg || null; G.ui.confirmT = G.vt; break; // ui: "Start over?" on the title
  }
}

export { ABILITIES, PHYS, DEBUG };
