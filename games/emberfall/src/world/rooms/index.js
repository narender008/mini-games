// Every room of Emberfall, by biome (pure data: tools/validate.mjs loads it in node).
import { HOLLOW } from './hollow.js';
import { THICKET } from './thicket.js';
import { CLOISTER } from './cloister.js';
import { CORE } from './core.js';
export const ROOM_LIST = [...HOLLOW, ...THICKET, ...CLOISTER, ...CORE];
