// Foe painters registry. The renderer calls drawFoe(ctx, e, G, P) for every
// foe that is not a boss, with ctx translated to its foot point (e.x, e.y - e.z)
// at world scale, and reads foeLight(e) (also left on e.light) for its light.
// drawFoeFx / foeFxLights / drawFoeProjectile: see fx.js.
import hollow from './hollow.js';
import thornling from './thornling.js';
import knight from './knight.js';
import glassKnight from './glassKnight.js';
import needlecaster from './needlecaster.js';
import chorister from './chorister.js';
import snarl from './snarl.js';
import loomhulk from './loomhulk.js';
import bellowsBrute from './bellowsBrute.js';
import lanternWarden from './lanternWarden.js';
import forgeThrall from './forgeThrall.js';
import echo from './echo.js';
import unspooler from './unspooler.js';

export const PAINTERS = { hollow, thornling, knight, glassKnight, needlecaster, chorister, snarl, loomhulk, bellowsBrute, lanternWarden, forgeThrall, echo, unspooler };
export { drawFoeFx, foeFxLights, drawFoeProjectile, foeProjectileLight, FOE_PROJECTILES } from './fx.js';

export function drawFoe(ctx, e, G, P) {
  const fn = PAINTERS[e.art] || PAINTERS[e.kind] || hollow;
  fn(ctx, e, G, P);
}
export function foeLight(e) {
  const l = e.light;
  if (!l || e.hidden || e.gone) return null;
  return l;
}
