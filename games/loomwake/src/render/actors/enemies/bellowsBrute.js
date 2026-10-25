// Bellows Brute: a Loomhulk stitched around a forge bellows. Leather pleats
// in its belly pump with every breath, a furnace grate for a face; it breathes
// fire in a cone (and sweeps it, when elite).
import { begin, end } from './kit.js';
import { drawBruteBody } from './loomhulk.js';

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  drawBruteBody(ctx, S, 'bellows');
  end(ctx, S);
}
