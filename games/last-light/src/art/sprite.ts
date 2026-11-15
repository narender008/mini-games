// What every character drawer hands to the view: a set of animation frames, each a painter that draws
// one frame in world units (origin at the frame's top-left, w x h units) into two contexts:
//   g: the lit body (multiplied by the light map like the rest of the world)
//   e: the emissive layer (eyes, crystals, cracks, flames and their halos), drawn additively after the
//      light map so it stays bright in the dark.
// The view paints frames into texture atlases at a density chosen from the screen (src/view/textures.ts).
import type { Ctx } from './paint';

export type Painter = (g: Ctx, e: Ctx) => void;

export interface SpriteSet {
  w: number;
  h: number;
  /** The feet line inside a frame, in units from the top. */
  footY: number;
  anims: Record<string, Painter[]>;
}

/** Density used for the emissive atlas relative to the body atlas (glows are soft, so half is plenty). */
export const EMISSIVE_SCALE = 0.5;
