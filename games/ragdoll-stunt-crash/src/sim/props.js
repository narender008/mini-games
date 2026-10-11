// The things on a track. Each prop is a Planck body with an owner record
// ({ kind: 'prop', prop }) on its fixtures; how it behaves comes from the
// KINDS table: static scenery, loose dynamic clutter, breakables (crates,
// glass, snowmen, ice), explosives (red drums, TNT), bouncers (trampolines,
// bumpers, tyres), kinematic traffic that loops along a stretch of road,
// pendulums (wrecking balls, logs), sensors (hoops of fire, bullseyes) and
// spikes that impale. Loose props stand square to the ground under them.
// Traffic is heavy, upright dynamic bodies held at their speed each step (so
// a lorry rides over the stuntman instead of crushing him through the road)
// that meet only the road, other traffic, him and his ride; far-lane traffic
// is kinematic scenery that collides with nothing. Crate debris is built with
// the crate, asleep and out of the world, so breaking one allocates nothing.
import { pl, CAT } from './physics.js';
import { PROPS } from './defs.js';
import { rand } from '../config.js';

const STATIC_MASK = 0xffff & ~CAT.TRAFFIC;
const DYN_MASK = CAT.WORLD | CAT.PROP | CAT.RIDE | CAT.RAG | CAT.DEBRIS;
const TRAFFIC_MASK = CAT.WORLD | CAT.RIDE | CAT.RAG | CAT.TRAFFIC;

// body: static | dynamic | kinematic; kg: mass for dynamic bodies; breaks: N·s that smashes it
export const KINDS = {
  wall: { body: 'static' },
  drum: { body: 'dynamic', kg: 45, friction: 0.45, rest: 0.2, breaks: 0 },
  crate: { body: 'dynamic', kg: 28, friction: 0.6, rest: 0.05, breaks: 55, debris: 4 },
  plank: { body: 'dynamic', kg: 4, friction: 0.6, rest: 0.1, debrisOnly: true },
  glass: { body: 'static', pre: true, shatter: 3 },
  pole: { body: 'static' },
  trampoline: { body: 'static', pre: true, bounce: 13 },
  spikes: { body: 'static', impale: true },
  sedan: { body: 'dynamic', kg: 1500, friction: 0.4, rest: 0.05, traffic: true },
  truck: { body: 'dynamic', kg: 14000, friction: 0.4, rest: 0.05, traffic: true },
  bus: { body: 'dynamic', kg: 11000, friction: 0.4, rest: 0.05, traffic: true },
  forklift: { body: 'dynamic', kg: 3000, friction: 0.4, rest: 0.05, traffic: true },
  tyres: { body: 'dynamic', kg: 12, friction: 0.9, rest: 0.75 },
  haybale: { body: 'dynamic', kg: 60, friction: 1, rest: 0, soft: true },
  cone: { body: 'dynamic', kg: 3, friction: 0.7, rest: 0.2 },
  billboard: { body: 'static' },
  plankdeck: { body: 'static' },
  beam: { body: 'static' },
  wreckingball: { body: 'dynamic', kg: 900, friction: 0.3, rest: 0.1, pendulum: true },
  bumper: { body: 'static', pre: true, kick: 16, circle: true },
  hoop: { body: 'static', sensor: true },
  target: { body: 'static', sensor: true },
  container: { body: 'static' },
  snowman: { body: 'dynamic', kg: 40, friction: 0.5, rest: 0.05, breaks: 22 },
  iceblock: { body: 'dynamic', kg: 90, friction: 0.05, rest: 0.1, breaks: 70 },
  acunit: { body: 'dynamic', kg: 80, friction: 0.6, rest: 0.1 },
  watertower: { body: 'static' },
  junkcar: { body: 'dynamic', kg: 700, friction: 0.7, rest: 0.05 },
  log: { body: 'dynamic', kg: 220, friction: 0.6, rest: 0.1, pendulum: true },
  lavarock: { body: 'static' },
  ramp: { body: 'static', poly: 'ramp' },
  platform: { body: 'static' },
};

export function buildProp(phys, spec, terrain) {
  const t = spec.t;
  const K = KINDS[t];
  const D = PROPS[t];
  const w = spec.w ?? D.w;
  const h = spec.h ?? D.h;
  const variant = spec.v ?? defaultVariant(t);
  const mat = spec.mat ?? (t === 'crate' && variant === 'ice' ? 'glass' : D.mat);
  let type = spec.body ?? K.body;
  if (spec.fixed) type = 'static';
  if (K.traffic && spec.far) type = 'kinematic';
  // a loose prop on the ground leans with the slope, lifted (and stacked) along its normal
  const lean = type === 'dynamic' && !K.traffic && spec.a === undefined && spec.y === undefined && spec.on === undefined;
  const ang = lean ? terrain.slope(spec.x) : spec.a ?? 0;
  const lift = h / 2 + (spec.up ?? 0);
  const x = lean ? spec.x - lift * Math.sin(ang) : spec.x;
  const y = spec.y ?? (spec.on ?? terrain.at(spec.x)) + (lean ? lift * Math.cos(ang) : lift);
  const prop = {
    t,
    variant,
    w,
    h,
    mat,
    seed: spec.seed ?? Math.round(x * 13 + y * 7) & 0xffff,
    body: null,
    item: null,
    owner: null,
    explosive: (t === 'drum' && variant === 'lube') || (t === 'crate' && variant === 'tnt'),
    breaks: t === 'crate' && variant === 'ice' ? 80 : K.breaks || 0,
    broken: false,
    debris: [],
    stuck: 0, // parts impaled on these spikes
    pivot: null,
    len: 0,
    vx: spec.vx ?? 0,
    range: spec.range ?? null,
    last: -9, // time it last bounced / kicked / fired
    hit: false, // the stuntman has touched it
    far: !!spec.far, // decorative traffic in the far lane (does not collide)
    spec,
  };
  const owner = { kind: 'prop', mat, prop, pre: !!K.pre || prop.breaks > 0, touch: -1 };
  prop.owner = owner;
  const body = phys.body({ type, position: pl.Vec2(x, y), angle: ang, bullet: false, angularDamping: K.soft ? 2 : 0.1, linearDamping: K.soft ? 0.6 : 0, fixedRotation: !!K.traffic });
  const cat = K.traffic ? CAT.TRAFFIC : type === 'static' ? CAT.WORLD : CAT.PROP;
  const mask = prop.far ? 0 : K.traffic ? TRAFFIC_MASK : type === 'dynamic' ? DYN_MASK : STATIC_MASK;
  let shape;
  if (K.circle || t === 'wreckingball') shape = pl.Circle(Math.min(w, h) / 2);
  else if (K.poly === 'ramp') shape = pl.Polygon([pl.Vec2(-w / 2, -h / 2), pl.Vec2(w / 2, -h / 2), pl.Vec2(w / 2, h / 2)]);
  else shape = pl.Box(w / 2, h / 2);
  const area = K.circle || t === 'wreckingball' ? Math.PI * (Math.min(w, h) / 2) ** 2 : K.poly === 'ramp' ? (w * h) / 2 : w * h;
  body.createFixture(shape, {
    density: K.kg ? K.kg / area : 1,
    friction: K.friction ?? 0.6,
    restitution: K.rest ?? 0.1,
    isSensor: !!K.sensor,
    filterCategoryBits: K.sensor ? CAT.SENSOR : cat,
    filterMaskBits: K.sensor ? CAT.RAG : mask,
    userData: owner,
  });
  if (K.traffic) body.setLinearVelocity(pl.Vec2(prop.vx, 0));
  if (K.pendulum) {
    // a rigid pendulum: the body turns about a pivot `len` above its centre
    const len = spec.len ?? 8;
    prop.len = len;
    prop.pivot = { x, y: y + len };
    const anchor = phys.body({ type: 'static', position: pl.Vec2(x, y + len) });
    phys.world.createJoint(pl.RevoluteJoint({}, anchor, body, pl.Vec2(x, y + len)));
    if (spec.swing) {
      // start it swinging: the bob moves sideways at `swing` m/s through the bottom
      body.setLinearVelocity(pl.Vec2(spec.swing, 0));
      body.setAngularVelocity(spec.swing / len);
    }
  }
  prop.body = body;
  prop.item = phys.track(body, 'prop', prop);
  if (K.debris) {
    // the planks it breaks into, asleep outside the world until then
    for (let i = 0; i < K.debris; i++) {
      const pb = phys.body({ type: 'dynamic', position: pl.Vec2(x, y), angle: 0, active: false });
      const pw = w * 0.95;
      const ph = PROPS.plank.h * (w / 0.9);
      const pown = { kind: 'prop', mat, prop: null, pre: false, touch: -1 };
      pb.createFixture(pl.Box(pw / 2, ph / 2), { density: 4 / (pw * ph), friction: 0.6, restitution: 0.1, filterCategoryBits: CAT.DEBRIS, filterMaskBits: CAT.WORLD | CAT.PROP | CAT.RAG | CAT.RIDE | CAT.DEBRIS, userData: pown });
      pb.setActive(false);
      const piece = { t: 'plank', variant, w: pw, h: ph, mat, seed: prop.seed + i, body: pb, item: null, owner: pown, debrisOf: prop, broken: false, hit: false, spec: null };
      pown.prop = piece;
      piece.item = phys.track(pb, 'prop', piece);
      piece.item.vis = false;
      prop.debris.push(piece);
    }
  }
  return prop;
}

function defaultVariant(t) {
  return { wall: 'concrete', drum: 'coolant', crate: 'wood', glass: 'pane', pole: 'lamp', sedan: 'sedan', container: 'red', ramp: 'wood', platform: 'concrete', plankdeck: 'wood' }[t] || '';
}

// Breaks a crate (or ice block, snowman) into its debris. Returns the debris list.
export function breakProp(phys, prop, tmp) {
  if (prop.broken) return null;
  prop.broken = true;
  const b = prop.body;
  const p = b.getPosition();
  const v = b.getLinearVelocity();
  const vx = v.x;
  const vy = v.y;
  const ang = b.getAngle();
  takeOut(b);
  prop.item.vis = false;
  const n = prop.debris.length;
  for (let i = 0; i < n; i++) {
    const d = prop.debris[i];
    const k = (i + 0.5) / n - 0.5;
    tmp.x = p.x + Math.sin(ang) * k * prop.h * -1 + rand(-0.1, 0.1);
    tmp.y = p.y + Math.cos(ang) * k * prop.h;
    d.body.setTransform(tmp, ang + rand(-0.3, 0.3));
    d.body.setActive(true);
    tmp.x = vx * 0.6 + rand(-2.5, 2.5);
    tmp.y = vy * 0.6 + rand(0, 4);
    d.body.setLinearVelocity(tmp);
    d.body.setAngularVelocity(rand(-8, 8));
    phys.settle(d.item);
    d.item.vis = true;
  }
  return prop.debris;
}

// Takes a prop out of the world (glass shattered, a drum blown up).
export function removeProp(prop) {
  if (prop.broken) return;
  prop.broken = true;
  takeOut(prop.body);
  prop.item.vis = false;
}

// Props sleep until hit: whatever rested on a body taken away wakes, so it falls.
function takeOut(b) {
  for (let e = b.getContactList(); e; e = e.next) if (e.other.isDynamic()) e.other.setAwake(true);
  b.setActive(false);
}
