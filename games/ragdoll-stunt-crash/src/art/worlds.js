// The ten track worlds, painted entirely in code (see src/art/worlds/). Each
// entry is { name, sky(ctx, w, h), layers: [{ depth, height, paint(ctx, w, h),
// base }], ground: { paint(ctx, solid, surface, b, rng), deep }, fog, ambient,
// water, lava }:
//  - sky paints a whole screen-sized canvas once per resize, with the horizon
//    at about 62% of its height (the strips cover everything below it);
//  - layers run far to near; each paints a horizontally tileable strip whose
//    silhouette stands on the bottom edge (its last row is the colour `base`,
//    which fills below it) and scales everything to the h it is given. `height`
//    is the screen fraction the layer was drawn for (about 0.55 far, 0.3 near);
//  - ground.paint works in metres with y down, inside a chunk clip. Every
//    texture (stones, cracks, dashes, stripes, windows, puddles) is seeded by
//    world position rather than by `rng`, so neighbouring chunks join cleanly.
// Distant layers are painted pale and hazy; the renderer mixes `fog` in too.
import { testtrack } from './worlds/testtrack.js';
import { quarry } from './worlds/quarry.js';
import { circus } from './worlds/circus.js';
import { highway } from './worlds/highway.js';
import { construction } from './worlds/construction.js';
import { snow } from './worlds/snow.js';
import { city } from './worlds/city.js';
import { junkyard } from './worlds/junkyard.js';
import { harbour } from './worlds/harbour.js';
import { volcano } from './worlds/volcano.js';

export const WORLDS = {
  testtrack,
  quarry,
  circus,
  highway,
  construction,
  snow,
  city,
  junkyard,
  harbour,
  volcano,
};
