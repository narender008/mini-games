// Tidebreaker: constants, URL switches and local storage. Everything here is
// read-only after load.

export const W = 1280, H = 720;           // logical canvas size; the canvas is scaled to fit
export const STEP = 1 / 60;               // fixed simulation step (seconds)
export const MAX_STEPS = 8;               // most fixed steps per animation frame

export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const COVER = QUERY.has('cover');  // hide the interface, for screenshots
export const PLAY = QUERY.has('play');    // skip the title and start a run
export const QUALITY = QUERY.get('quality') || 'auto'; // high | low | auto

export const SERIF = "Georgia, 'DejaVu Serif', 'Times New Roman', serif";
export const SANS = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// The play lane: the swell every ship rides on (see world/ocean.js laneY).
export const LANE_Y = 540;
// Where the player's galleon may sail along the lane.
export const PLAYER_X = { min: 120, max: 560, start: 300 };

// Player stats before any upgrade (upgrades.js computeStats builds on these).
export const BASE_STATS = {
  maxHull: 240,     // hit points
  guns: 3,          // balls per broadside
  dmg: 14,          // damage per ball
  reload: 1.5,      // seconds between broadsides
  crit: 0.08,       // crit chance per ball
  critMul: 2,       // crit damage multiplier
  spread: 18,       // px of scatter around the aim point
  splash: 0,        // splash radius in px (0 = none)
  burn: 0,          // burn damage per second applied on hit (0 = none)
  pierce: 0,        // ships a ball passes through after the first
  speed: 230,       // sailing speed along the lane, px/s
  regen: 0,         // hull per second
  armor: 0,         // fraction of damage ignored, 0..0.6
  goldMul: 1,       // gold multiplier
  shotSpeed: 1,     // flight speed multiplier
  cards: 3,         // cards offered
  rerollCost: 50,
  // ability ranks (0 = not owned) and cooldowns in seconds
  chain: 0, fire: 0, lightning: 0, kraken: 0,
  cdChain: 8, cdFire: 10, cdLightning: 12, cdKraken: 20,
  // ability strength (upgrades.js raises these with ranks and combos; combat.js and kraken.js read them)
  chainDmg: 2.5,        // chain shot damage, x dmg
  chainSlow: 0.4,       // fraction of speed lost while slowed
  slowTime: 4,          // seconds
  barrels: 3,           // fire barrels per throw
  burnTime: 6,          // seconds a fire burns
  burnDps: 6,           // burn damage per second from fire barrels
  lightningTargets: 3,  // ships one lightning bolt chains through
  lightningDmg: 40,
  stormBonus: 2,        // lightning damage multiplier in the storm biome
  krakenDmg: 45,        // per second while a tentacle crushes
  krakenTentacles: 1,
  // combo flags (0 = off)
  lightningIgnites: 0,  // lightning sets targets on fire
  broadsideBurn: 0,     // every broadside ball sets fire
  critArc: 0,           // crits arc lightning to this many nearby ships
  skip: 0,              // balls that miss skip off the water this many times
  krakenSlow: 0,        // kraken-held ships are chain-slowed and take x(1+krakenSlow) damage
};

// The voyage: five legs, three nodes each. Node types: 'fleet' (ai.js),
// 'fortress', 'serpent', 'leviathan' (boss.js).
export const LEGS = [
  { id: 'dawn',   name: 'Coral Shallows',  biome: 'dawn',   nodes: ['fleet', 'fleet', 'fortress'] },
  { id: 'sunset', name: 'Ember Reef',      biome: 'sunset', nodes: ['fleet', 'fleet', 'fortress'] },
  { id: 'storm',  name: 'Tempest Strait',  biome: 'storm',  nodes: ['fleet', 'fleet', 'fleet'] },
  { id: 'fog',    name: 'Mistcoil Shallows', biome: 'fog',    nodes: ['fleet', 'fleet', 'serpent'] },
  { id: 'night',  name: 'The Maelstrom',   biome: 'night',  nodes: ['fleet', 'fleet', 'leviathan'] },
];
export const SHIP_NAME = 'The Gilded Gull';

// localStorage, namespaced. Nothing is saved in ?debug.
const NS = 'tidebreaker.';
export const store = {
  get(key, def) {
    try { const v = localStorage.getItem(NS + key); return v == null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, val) {
    if (DEBUG) return;
    try { localStorage.setItem(NS + key, JSON.stringify(val)); } catch { /* storage full or blocked */ }
  },
};
