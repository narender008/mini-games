// Tile codes shared by the world, physics and the painters. Rooms are written
// as strings of these characters (see world/rooms/*.js); world.js turns them
// into a Uint8Array of codes.
export const T = {
  EMPTY: 0,    // ' ' or '.'
  SOLID: 1,    // '#' rock / brick (the painter picks the look per biome)
  ONEWAY: 2,   // '=' ledge you can jump up through and drop down through (down + jump)
  SPIKE: 3,    // '^' hurts (1 flame) and puts you back on the last safe ground
  WATER: 4,    // '~' swim: slow fall, swim up with jump, no hurt
  LAVA: 5,     // 'L' like spikes, but harmless in Fire Form (you wade through it)
  CRUMBLE: 6,  // 'C' solid floor that breaks 0.5 s after you stand on it, back after 4 s
  CRACK: 7,    // 'X' solid until an Ember Dash hits it, then gone for good (saved)
  BRAMBLE: 8,  // 'B' ember-thorn: solid and hurts on touch, burnt away for good by Fire Form
  FAKE: 9,     // 'S' drawn exactly like SOLID but passable: hides secret rooms
  DOOR: 10,    // 'D' boss door: passable; world.js swaps these tiles to SOLID while the room's boss fight is on
};
export const CHARS = { ' ': 0, '.': 0, '#': 1, '=': 2, '^': 3, '~': 4, 'L': 5, 'C': 6, 'X': 7, 'B': 8, 'S': 9, 'D': 10 };
export const CODE_CHAR = ['.', '#', '=', '^', '~', 'L', 'C', 'X', 'B', 'S', 'D'];

// Solid for movement (ONEWAY only from above).
export const isSolidCode = (c) => c === T.SOLID || c === T.CRUMBLE || c === T.CRACK || c === T.BRAMBLE;
export const isHurtCode = (c) => c === T.SPIKE || c === T.LAVA || c === T.BRAMBLE;
