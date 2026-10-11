// The stuntman, the rides and the launchers: the public face of the actor
// painters. The drawing itself lives in actors-man.js (the stuntman and gore),
// actors-cars.js and actors-ramps.js (the ride bodies), actors-wheels.js and
// actors-launch.js (barrels, stands, the slingshot), with helpers in
// actors-kit.js. Every painter is (ctx, ...) with the context scaled so that
// 1 unit is 1 metre, +x right, +y down, origin at the object's physics origin.
import { RIDES } from '../sim/defs.js';
import { paintCar } from './actors-cars.js';
import { paintRamp } from './actors-ramps.js';

export { paintPart, paintHelmet, paintStump, paintBone, paintTooth } from './actors-man.js';
export { paintWheel } from './actors-wheels.js';
export { paintBarrel, paintLauncherBase, paintPouch } from './actors-launch.js';

// The body of a car or ramp ride, no wheels, the outline on `profile`.
// opts.layer: 'back' (interior, far side) or 'front' (near-side body);
// cars also take opts.crush 0..1 and opts.glass 'intact' | 'cracked' | 'gone'.
export function paintRide(ctx, id, opts) {
  const o = opts || {};
  if (RIDES[id].kind === 'car') paintCar(ctx, id, o);
  else paintRamp(ctx, id, o);
}

// How far each painter draws, [x0, y0, x1, y1] in metres from its origin
// (y down, every state and layer included, wheels excluded), measured from
// the painters themselves: size the offscreen canvases from these.
export const ACTOR_BOUNDS = {
  hatchback: [-2.4, -1.4, 2.3, 0.7],
  muscle: [-2.5, -0.85, 2.5, 0.6],
  pickup: [-2.75, -1.55, 2.8, 0.45],
  rocket: [-2.9, -0.9, 3.05, 0.5],
  cart: [-0.9, -0.75, 0.75, 0.6],
  bike: [-0.9, -1.0, 1.2, 0.35],
  tub: [-1.1, -0.85, 1.05, 0.4],
  sled: [-1.5, -0.95, 1.55, 0.4],
  circus: [-2.05, -0.55, 2.75, 1.3],
  mega: [-2.9, -0.75, 3.95, 1.65],
  sling: [-1.2, -4.4, 1.2, 0.1],
  pouch: [-0.4, -0.1, 0.4, 0.24],
  helmet: [-0.19, -0.24, 0.21, 0.16],
  head: [-0.25, -0.21, 0.22, 0.18],
};
