// All dialogue, merged. Data only. story.js selects from DIALOGUE; content() in the debug hook can list it.
import orrin from './orrin.js';
import thimbleby from './thimbleby.js';
import pell from './pell.js';
import nell from './nell.js';
import weaver from './weaver.js';
import sable from './sable.js';
import patrons from './patrons.js';
import bosses from './bosses.js';
import wanderers from './wanderers.js';
import narration from './narration.js';
import reactions from './reactions.js';
import idle from './idle.js';

export { SPEAKERS, SPEAKER_IDS, HUB_NPCS, WANDERERS, PATRONS, BOSSES, REGIONS } from './speakers.js';
export { REGION_CARDS, BOSS_CARDS } from './narration.js';
export { CODEX } from './codex.js';

export const GROUPS = { orrin, thimbleby, pell, nell, weaver, sable, patrons, bosses, wanderers, narration, reactions, idle };
export const DIALOGUE = Object.values(GROUPS).flat();
export const BY_ID = new Map(DIALOGUE.map((e) => [e.id, e]));
export const BY_SPEAKER = new Map();
for (const e of DIALOGUE) { if (!BY_SPEAKER.has(e.speaker)) BY_SPEAKER.set(e.speaker, []); BY_SPEAKER.get(e.speaker).push(e); }
export const BY_EVENT = new Map();
for (const e of DIALOGUE) for (const on of [].concat(e.on)) { if (!BY_EVENT.has(on)) BY_EVENT.set(on, []); BY_EVENT.get(on).push(e); }
// how many spoken lines the script holds (memories and endings counted separately in check-story)
export const LINE_COUNT = DIALOGUE.reduce((n, e) => n + e.lines.length, 0);
