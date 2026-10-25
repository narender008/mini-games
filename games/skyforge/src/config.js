// Skyforge Tycoon tuning. One section per area; each owner edits only its own
// section. Everything here is plain data so tests can read it via content().
export const VERSION = 1;          // save schema version (SAVE owns migrations)
export const DT = 1 / 30;          // fixed sim step, game seconds
export const DAY = 300;            // game seconds per in-game day
export const SPEEDS = [0, 1, 2, 3];
export const T = 48;               // px per tile at zoom 1 (see render/camera.js)

export const CFG = {
  // ECONOMY section
  economy: {},
  // THREATS section
  threats: {},
  // PROGRESSION section
  progression: {},
  // SAVE section
  save: { autosaveMs: 30000 },
  // RENDERER section
  render: {},
  // INPUT section
  input: {},
  // AUDIO section
  audio: {},
};
