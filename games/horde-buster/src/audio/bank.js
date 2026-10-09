// The two halves of the sound bank joined: chapter 1's sounds and score (sfx.js, music.js) and stage 2's
// (sfx2.js, music2.js). lib.js and audio.js read the tables from here.
import { SFX as SFX1 } from './sfx.js';
import { SFX2 } from './sfx2.js';
import { TRACKS as TRACKS1 } from './music.js';
import { TRACKS2 } from './music2.js';

export const SFX = { ...SFX1, ...SFX2 };
export const TRACKS = { ...TRACKS1, ...TRACKS2 };
