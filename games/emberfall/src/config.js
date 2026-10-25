// Emberfall: constants, URL switches and local storage. Everything here is
// read-only after load.

export const W = 1280, H = 720;           // logical canvas size; the canvas is scaled to fit
export const STEP = 1 / 60;               // fixed simulation step (seconds)
export const MAX_STEPS = 8;               // most fixed steps per animation frame

export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const COVER = QUERY.has('cover');  // hide the interface, for screenshots
export const PLAY = QUERY.has('play');    // skip the title and start (or continue) a game
export const QUALITY = QUERY.get('quality') || 'auto'; // high | low | auto

export const SERIF = "Georgia, 'DejaVu Serif', 'Times New Roman', serif";
export const SANS = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// ---------------------------------------------------------------- the world
// A room is a grid of TILE px tiles, ROOM_W x ROOM_H tiles per screen; rooms
// are whole screens (w x h screens) placed on the world grid at (gx, gy) in
// screens, so neighbouring rooms meet edge to edge (see world/world.js).
export const TILE = 40;
export const ROOM_W = 32, ROOM_H = 18;

export const BIOMES = {
  hollow:   { name: 'Hollow Caves',     color: '#ffa34a' },
  thicket:  { name: 'Lumen Thicket',    color: '#e05aff' },
  cloister: { name: 'Drowned Cloister', color: '#3ad6d0' },
  core:     { name: 'Ember Core',       color: '#ff4a2a' },
};

// Abilities in the order the first run finds them.
export const ABILITIES = ['twin-leap', 'ember-dash', 'root-grip', 'chain-hook', 'fire-form'];
export const ABILITY_NAMES = {
  'twin-leap': 'Twin Leap', 'ember-dash': 'Ember Dash', 'root-grip': 'Root Grip',
  'chain-hook': 'Chain Hook', 'fire-form': 'Fire Form',
};

export const BOSSES = {
  'gravel-wyrm':  { name: 'The Gravel Wyrm',  biome: 'hollow' },
  'sporemother':  { name: 'The Sporemother',  biome: 'thicket' },
  'drowned-abbot': { name: 'The Drowned Abbot', biome: 'cloister' },
  'cinder-king':  { name: 'The Cinder King',  biome: 'core' },
};

// The movement the level design is built around. player.js must hit these
// (the test suite measures them); world rooms are designed against them.
export const PHYS = {
  gravity: 2600,          // px/s^2 while rising with jump held (falls faster, see player.js)
  runSpeed: 320,          // px/s
  jumpHeight: 150,        // px, full jump from flat ground (3.75 tiles: 3-tile ledges yes, 4 no)
  doubleJumpHeight: 120,  // px gained by the Twin Leap second jump (total reach 270 px, ~6 tiles)
  dashDistance: 220,      // px, Ember Dash on flat ground or in the air (no gravity during it)
  maxFall: 900,           // px/s
  hookRange: 280,         // px, Chain Hook reach to an anchor
  coyote: 0.1,            // s after leaving a ledge that a jump still works
  jumpBuffer: 0.12,       // s a jump press is remembered before landing
  playerW: 24, playerH: 56,
};

// Simple JSON wrapper around localStorage that never throws.
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('emberfall.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem('emberfall.' + key, JSON.stringify(value)); } catch { /* private mode */ } },
  del(key) { try { localStorage.removeItem('emberfall.' + key); } catch { /* ignore */ } },
};
