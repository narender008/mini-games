// Every prop painter and effect stamp for Ragdoll Stunt Crash, gathered in one
// place. PROP_PAINTERS has one (ctx, p) => void per key of PROPS in
// sim/defs.js; p is { w, h, variant, seed } and the context arrives scaled to
// metres, y down, origin at the centre of the prop's w x h box. The painters
// live in props-things.js (small and medium props), props-structure.js
// (barriers, poles, signs, ramps, containers), props-vehicles.js (traffic and
// the forklift) and props-fx.js (blood, shards, debris, scorch). Painters are
// fully opaque inside their silhouettes so blood can be stamped on with
// source-atop; only glass and ice are see-through. A painter given a partial
// p still works: a missing size, seed or variant falls back to the PROPS default.
import {
  paintDrum, paintCrate, paintPlank, paintGlass, paintTyre, paintHay, paintCone, paintBumper, paintHoop, paintTarget, paintSnowman, paintIce,
  paintAc, paintWreckingBall, paintLog, paintLavaRock, paintSpikes, paintTrampoline,
} from './props-things.js';
import {
  paintWall, paintPole, paintBillboard, paintDeck, paintBeam, paintRamp, paintPlatform, paintContainer, paintWaterTower,
} from './props-structure.js';
import { PROPS } from '../sim/defs.js';
import { paintSedan, paintTruck, paintBus, paintForklift, paintJunkCar } from './props-vehicles.js';

export { paintSplat, paintSmear, paintShard, paintDebris, paintScorch } from './props-fx.js';

function sized(key, paint) {
  const d = PROPS[key];
  return (ctx, p) => {
    const q = Object.assign({}, p);
    q.w = p.w || d.w;
    q.h = p.h || (p.variant === 'torch' ? 2.2 : d.h);
    q.seed = p.seed | 0;
    paint(ctx, q);
  };
}

const PAINTERS = {
  wall: paintWall,
  drum: paintDrum,
  crate: paintCrate,
  plank: paintPlank,
  glass: paintGlass,
  pole: paintPole,
  trampoline: paintTrampoline,
  spikes: paintSpikes,
  sedan: paintSedan,
  truck: paintTruck,
  bus: paintBus,
  forklift: paintForklift,
  tyres: paintTyre,
  haybale: paintHay,
  cone: paintCone,
  billboard: paintBillboard,
  plankdeck: paintDeck,
  beam: paintBeam,
  wreckingball: paintWreckingBall,
  bumper: paintBumper,
  hoop: paintHoop,
  target: paintTarget,
  container: paintContainer,
  snowman: paintSnowman,
  iceblock: paintIce,
  acunit: paintAc,
  watertower: paintWaterTower,
  junkcar: paintJunkCar,
  log: paintLog,
  lavarock: paintLavaRock,
  ramp: paintRamp,
  platform: paintPlatform,
};

export const PROP_PAINTERS = {};
for (const key of Object.keys(PAINTERS)) PROP_PAINTERS[key] = sized(key, PAINTERS[key]);
