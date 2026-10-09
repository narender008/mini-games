// Each chapter's ground kind -> its GLSL source and function name (see groundBake in ../shaders.js).
import { CITY } from './city.js';
import { GRAVEYARD } from './graveyard.js';
import { HELL } from './hell.js';

export const GROUNDS = [
  { src: CITY, fn: 'groundCity' },
  { src: GRAVEYARD, fn: 'groundGraveyard' },
  { src: HELL, fn: 'groundHell' },
];
