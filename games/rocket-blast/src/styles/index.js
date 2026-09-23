// The three enemy styles. Every style draws the same Enemy objects (see
// enemy.js) with its own instanced parts, so switching is instant.
//
// A style class has:
//   constructor({ capacity })
//   group        Object3D holding its instanced meshes
//   draw(enemies, t)  refill the instances from the enemies' state
//   dispose()
import { BlocksStyle } from './blocks.js';
import { AliensStyle } from './aliens.js';
import { RobotsStyle } from './robots.js';

export const STYLE_CLASSES = { blocks: BlocksStyle, aliens: AliensStyle, robots: RobotsStyle };
