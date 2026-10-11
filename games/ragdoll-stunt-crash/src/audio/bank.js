// The sound bank joined: the impacts, bones and crash (sfx.js) and the rest (sfx2.js), with the music tracks
// (music.js). lib.js and audio.js read the tables from here.
import { SFX1 } from './sfx.js';
import { SFX2 } from './sfx2.js';
import { TRACKS } from './music.js';

export const SFX = { ...SFX1, ...SFX2 };
export { TRACKS };
