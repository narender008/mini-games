// Weapons are plain data (twins.js, staff.js); the heroine's state machine
// (hero.js) plays them. To add a weapon: a new file with the same fields, its
// sprite set (blender/heroine.py renders every weapon's animations), an entry
// here, and a rack sprite in the Hollow.
import { TWINS } from './twins.js';
import { STAFF } from './staff.js';

export const WEAPONS = { twins: TWINS, staff: STAFF };
export const WEAPON_LIST = [TWINS, STAFF];
