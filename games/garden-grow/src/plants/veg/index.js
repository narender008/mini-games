// The vegetable species. Plants (../index.js) registers these next to the
// flowers; each factory implements the species interface described there.
import { createCarrot } from './carrot.js';
import { createPumpkin } from './pumpkin.js';
import { createStrawberry } from './strawberry.js';
import { createTomato } from './tomato.js';

export const VEG_SPECIES = { carrot: createCarrot, pumpkin: createPumpkin, strawberry: createStrawberry, tomato: createTomato };
