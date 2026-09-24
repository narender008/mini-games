// Block Tower physics: a Rapier rigid-body world at real scale (metres,
// 4 cm blocks, g = 9.81 m/s²) that keeps finished towers perfectly still yet
// lets them crash for real.
//
// Why blocks freeze. Rapier's contacts are soft (spring-like constraints
// solved a few times per step). At toy scale a stack of 20+ fully dynamic
// blocks sinks, leans and now and then falls on its own, whatever the
// tuning. So a block that has come to rest on the floor or on frozen blocks
// is switched to a FIXED body ('frozen'). A frozen tower cannot move at all,
// so it stands perfectly still by construction, and costs nothing to step.
// A new block always lands on fixed supports, which Rapier handles very
// well: a block placed more than half off its support simply falls off by
// real physics before it ever freezes. A block resting on something still
// moving (or held) waits.
//
// Why balance is checked by hand. A frozen block no longer feels the blocks
// stacked on it later, so a static balance check stands in for the missing
// whole-tower physics. When a block freezes it records where it touches the
// things holding it up (solver contact points of its contact manifolds, read
// while it was still dynamic, plus sampled rim points for round cylinder
// ends, which Rapier reports as only a few points). The check walks the
// frozen blocks top-down and adds up each block's load (its own mass plus
// its share of every block resting on it). The load's centre of mass must
// lie inside the hull of the block's support points. A block resting on
// several supporters shares its load between them (least-squares weights on
// the contact centroids; the lever rule for two), so bridges, arches and
// pyramids stand. When a load passes an edge by more than TOPPLE_TOL the
// block 'topples': it and everything it carries become dynamic, get a small
// tip over the edge, and real physics carries out the fall. Blocks that
// settle again after being woken were just held up by real physics under
// their present load, so the check accepts that state and only judges what
// is added later.
//
// Why frozen blocks wake. Hard hits on a frozen block (contact force events
// turned into the speed they would give it) unfreeze it and everything
// resting on it. The momentum the fixed body swallowed is handed back to
// both bodies, so the hit reads as it would against a free block. Gentle
// landings don't count, a dragged block must shove hard, a slow tool's push
// is summed over a short window, and a kinematic tool wakes what it touches.
// Anything knocked off then hits the frozen blocks below and wakes them in
// turn, so a crash cascades naturally. wake() unfreezes on request; blocks
// woken without a knock freeze again as soon as they are still (about 0.1 s)
// so the soft contacts have no time to sink or lean the tower. A block still
// free TIRED_TIME after it was dropped or woken gets braked: Rapier's round
// rims can roll or wobble for ever, and real wood would have stopped. One
// that stays calm though its contacts say it should tip (wedged, or pinned
// by blocks on it) freezes after about a second anyway.
//
// Collider notes. Rounded shapes keep the true outer size. A cylinder is a
// round cylinder for its ends plus a many-sided prism for its side, and a
// prism with a many-cornered face (the half-round) is sliced into parts of
// at most four corners: see colliderParts for the Rapier quirks behind it.
//
// Stepping. Fixed 240 Hz steps with an accumulator and render interpolation
// between the last two steps. A frame runs at most MAX_SUBSTEPS steps or
// STEP_BUDGET_MS of physics, then drops the backlog, so a slow phone slows
// the simulation down instead of spiralling.
//
// Rapier comes through the game's import map. Node tests resolve the bare
// specifier with a module resolve hook (module.registerHooks); nothing here
// touches the DOM or three.js. Vectors in and out are plain {x, y, z} (and
// {x, y, z, w}) objects, so THREE.Vector3 / Quaternion work as they are.
//
// Handles (from addBlock / addBody) are plain objects: { id, kind: 'block' |
// 'body', shapeId, state: 'free' | 'frozen' | 'held' | 'kinematic' | 'fixed'
// (tool bodies only) | 'removed', body (Rapier), userData, settledAt,
// material, mass, colliders }. Fields starting with _ are internal.
import RAPIER from '@dimforge/rapier3d-compat';
import { SHAPES, EDGE, DENSITY } from './shapes.js';

// ---- tuning -------------------------------------------------------------

const HZ = 240; // default fixed physics rate; 4 cm blocks need small steps
// Contact stiffness as a share of the step rate: 0.75 (180 Hz at 240 Hz
// steps) keeps a woken 25-block tower leaning a few mm at most; half the
// step rate lets it lean about twice as far.
const CONTACT_SHARE = 0.75;
const LENGTH_UNIT = 0.04; // "typical object size" for Rapier's tolerances
const MAX_SUBSTEPS = 8; // per step() call: below 30 fps the sim slows down
const STEP_BUDGET_MS = 12; // stop substepping in a frame after this long
const G = 9.81;

// Surface coefficients (average combine rule between two blocks). Oiled
// wood on wood grips at about 0.5; lacquer is a little slicker.
export const MATERIALS = {
  wood: { friction: 0.5, restitution: 0.25 },
  paint: { friction: 0.42, restitution: 0.22 },
};

// Air drag and a stand-in for rolling resistance, which Rapier lacks
// (without it a cylinder rolls until it meets a wall).
const DAMP_LIN = 0.05;
const DAMP_ANG = 0.5;
// Real wood comes to rest within a second or two. A block that is still
// free TIRED_TIME after it was dropped, released or woken is caught in a
// Rapier artifact (a round rim that rolls or wobbles on and on, often
// shaking what rests on it), so it gets braked until it freezes.
const TIRED_TIME = 3; // s
const TIRED_LIN = 3;
const TIRED_ANG = 6;

// Settling: a free block is calm below these speeds; after SETTLE_TIME of
// calm on frozen blocks or the floor it freezes.
const CALM_LIN = 0.006; // m/s
const CALM_ANG = 0.12; // rad/s
const SETTLE_TIME = 0.25; // s
const RECHECK = 0.05; // s between support reads for a block that waits
const LOAD_FRACTION = 0.03; // contact impulse (share of own weight) that counts as load-bearing
const KNOCK_NO_FREEZE = 0.3; // s a knocked block and its load stay dynamic
// Blocks woken without a knock were at rest: they may freeze again as soon
// as their supports are frozen and they are not moving sideways, before the
// soft contacts under the whole tower's weight have time to lean it. Their
// first few cm/s of sinking (the contacts taking up the load) don't count.
const QUICK_LIN = 0.03; // m/s sideways
const QUICK_FALL = 0.25; // m/s down
const QUICK_ANG = 0.3; // rad/s
const QUICK_TIME = 0.1; // s

// Balance.
const TOPPLE_TOL = 0.001; // m past the support hull before a load topples
const VIRTUAL_MAX = 0.003; // m: a settled block's own COM may sit this far outside its contacts
// A block whose contacts say it should tip yet stays calm this many freeze
// attempts in a row (about 1 s) is wedged or pinned by blocks resting on it:
// physics holds it, so it freezes anyway.
const STUCK_TRIES = 3;
const MIN_SUPPORT_R = 0.003; // m: floor for the support size used by stability()
const VERIFY_TIME = 1.2; // s a toppling part stays dynamic before we judge it
const VERIFY_MOVE = 0.004; // m and ...
const VERIFY_TURN = 0.06; // rad: less movement than this means physics says it stands
const NUDGE_W = 0.25; // rad/s tip-over nudge about the support edge

// Knocks: impulse on a frozen block, as the speed it would give that block.
const KNOCK_DVH = 0.6; // m/s sideways: a real knock
const KNOCK_DVV = 4; // m/s vertical: only a heavy slam from above
const HELD_KNOCK_DVH = 0.8; // m/s: a dragged block has to shove hard
// A slow tool (a creeping wind-up car) never hits hard in one step, so its
// sideways impulse on a frozen block is summed with a short memory.
const PUSH_DVH = 0.35; // m/s summed ...
const PUSH_MEMORY = 0.2; // s

// Dragging: the held block is driven by velocity toward its target.
const HOLD_TAU = 0.05; // s to close the position gap
const HOLD_TAU_ROT = 0.07; // s to close the rotation gap
const HOLD_VMAX = 1.5; // m/s
const HOLD_WMAX = 14; // rad/s
const RELEASE_VMAX = 3; // m/s

// Impacts (for sound): contact force spikes turned into approach speeds.
const IMPACT_MIN_SPEED = 0.06; // m/s
const PAIR_COOLDOWN = 0.07; // s between clacks of the same two bodies
const BODY_COOLDOWN = 0.035; // s between clacks of one body
const MAX_IMPACTS = 8; // per step() call; the strongest win

const CYLINDER_SIDES = 32; // facets of a block cylinder's rolling side
const CYLINDER_RECESS = 0.001; // m: gap between a cylinder's end and side colliders
const CAP_SAMPLES = 16; // points sampled round a cylinder's end face
const CAP_TOUCH = 0.0008; // m: a sample this close to the other body touches it

// World bounds.
const WALL_DIST = 0.9; // m from the origin to the invisible walls' inner faces
const WALL_HEIGHT = 0.6;
const RESCUE_DIST = 1.2; // beyond this (tunnelled) a block is put back

// Collision groups (membership << 16 | filter).
const G_BLOCK = 0x0001;
const G_FLOOR = 0x0002;
const G_WALL = 0x0004;
const G_TOOL = 0x0008;
const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

const AE = () => RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS;

let initPromise = null;

// Start Rapier (its WebAssembly is inlined in the module). Call once and
// await it before creating a Physics.
export function initPhysics() {
  if (!initPromise) initPromise = RAPIER.init();
  return initPromise;
}

// ---- small geometry helpers ------------------------------------------------

// Andrew's monotone chain on flat [x0, y0, x1, y1, ...]; returns the hull
// counter-clockwise, collinear points dropped.
function hull2(flat) {
  const n = flat.length / 2;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  idx.sort((a, b) => flat[2 * a] - flat[2 * b] || flat[2 * a + 1] - flat[2 * b + 1]);
  const cross = (o, a, b) =>
    (flat[2 * a] - flat[2 * o]) * (flat[2 * b + 1] - flat[2 * o + 1]) -
    (flat[2 * a + 1] - flat[2 * o + 1]) * (flat[2 * b] - flat[2 * o]);
  const lower = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 1e-12) lower.pop();
    lower.push(i);
  }
  const upper = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 1e-12) upper.pop();
    upper.push(i);
  }
  lower.pop();
  upper.pop();
  const out = [];
  for (const i of lower.concat(upper)) out.push(flat[2 * i], flat[2 * i + 1]);
  if (out.length === 0 && n > 0) out.push(flat[0], flat[1]);
  return out;
}

function segDist(px, pz, ax, az, bx, bz) {
  const ex = bx - ax;
  const ez = bz - az;
  const l2 = ex * ex + ez * ez;
  let t = l2 > 0 ? ((px - ax) * ex + (pz - az) * ez) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - ex * t, pz - az - ez * t);
}

// Signed distance from (px, pz) to a CCW hull boundary: positive inside.
function hullDistance(h, n, px, pz) {
  if (n === 0) return Infinity;
  if (n === 1) return -Math.hypot(px - h[0], pz - h[1]);
  if (n === 2) return -segDist(px, pz, h[0], h[1], h[2], h[3]);
  let inside = true;
  let minEdge = Infinity;
  let minSeg = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = h[2 * i];
    const az = h[2 * i + 1];
    const bx = h[2 * j];
    const bz = h[2 * j + 1];
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez) || 1e-12;
    const d = (ex * (pz - az) - ez * (px - ax)) / len; // left of the edge = inside
    if (d < 0) inside = false;
    if (d < minEdge) minEdge = d;
    const s = segDist(px, pz, ax, az, bx, bz);
    if (s < minSeg) minSeg = s;
  }
  return inside ? minEdge : -minSeg;
}

// Nearest point on the hull boundary to (px, pz), written into out[0..1].
function hullNearest(h, n, px, pz, out) {
  let best = Infinity;
  for (let i = 0; i < Math.max(n, 1); i++) {
    const j = n > 1 ? (i + 1) % n : i;
    const ax = h[2 * i];
    const az = h[2 * i + 1];
    const ex = h[2 * j] - ax;
    const ez = h[2 * j + 1] - az;
    const l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((px - ax) * ex + (pz - az) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t;
    const qz = az + ez * t;
    const d = Math.hypot(px - qx, pz - qz);
    if (d < best) {
      best = d;
      out[0] = qx;
      out[1] = qz;
    }
  }
}

// Move every edge of a CCW polygon inward by r (mitred corners).
function insetPolygon(p, r) {
  const n = p.length / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const b = (i + 1) % n;
    let e1x = p[2 * i] - p[2 * a];
    let e1y = p[2 * i + 1] - p[2 * a + 1];
    let e2x = p[2 * b] - p[2 * i];
    let e2y = p[2 * b + 1] - p[2 * i + 1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1;
    e1y /= l1;
    e2x /= l2;
    e2y /= l2;
    const n1x = -e1y;
    const n1y = e1x;
    const n2x = -e2y;
    const n2y = e2x;
    const k = r / Math.max(0.05, 1 + n1x * n2x + n1y * n2y);
    out.push(p[2 * i] + (n1x + n2x) * k, p[2 * i + 1] + (n1y + n2y) * k);
  }
  return out;
}

// A hull given as prism point pairs along z (the shapes.js roof and
// half-round) -> its CCW outline in x/y and its z extent, or null.
function prismOutline(points) {
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 2; i < points.length; i += 3) {
    zMin = Math.min(zMin, points[i]);
    zMax = Math.max(zMax, points[i]);
  }
  const flat = [];
  for (let i = 0; i < points.length; i += 3) {
    const z = points[i + 2];
    const atMin = Math.abs(z - zMin) < 1e-9;
    if (!atMin && Math.abs(z - zMax) > 1e-9) return null;
    if (atMin) flat.push(points[i], points[i + 1]);
  }
  if (flat.length < 6 || zMax - zMin < 1e-6) return null;
  return { poly: hull2(flat), zMin, zMax };
}

// Prism points for an outline between the prism's z faces moved in by r.
function prismPoints(poly, prism, r) {
  const z0 = prism.zMin + r;
  const z1 = prism.zMax - r;
  const pts = new Float32Array(poly.length * 3);
  let k = 0;
  for (let i = 0; i < poly.length; i += 2) {
    pts[k++] = poly[i];
    pts[k++] = poly[i + 1];
    pts[k++] = z0;
    pts[k++] = poly[i];
    pts[k++] = poly[i + 1];
    pts[k++] = z1;
  }
  return pts;
}

// Cut a CCW convex polygon into slices of at most four corners, parallel to
// its longest edge (the half-round: slices parallel to its flat side). The
// last slice keeps five corners rather than leaving a sliver triangle.
function slicePolygon(p) {
  const n = p.length / 2;
  if (n <= 4) return [p];
  let a = 0;
  let best = -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const l = Math.hypot(p[2 * j] - p[2 * i], p[2 * j + 1] - p[2 * i + 1]);
    if (l > best) {
      best = l;
      a = i;
    }
  }
  // corners counted CCW from the end of the longest edge to its start
  const corners = (ks) => {
    const out = [];
    for (const k of ks) {
      const m = 2 * ((a + 1 + k) % n);
      out.push(p[m], p[m + 1]);
    }
    return out;
  };
  const pieces = [];
  let i = 0;
  let j = n - 1;
  while (j - i >= 2) {
    const left = j - i;
    if (left === 2) pieces.push(corners([j, i, i + 1]));
    else if (left === 3) pieces.push(corners([j, i, i + 1, i + 2]));
    else if (left === 4) pieces.push(corners([j, i, i + 1, i + 2, i + 3]));
    else pieces.push(corners([j, i, i + 1, j - 1]));
    if (left <= 4) break;
    i++;
    j--;
  }
  return pieces;
}

// Area, centroid and second moments (about the centroid) of a CCW polygon.
function polygonMoments(p) {
  const n = p.length / 2;
  let a = 0;
  let cx = 0;
  let cy = 0;
  let ixx = 0; // integral of y^2
  let iyy = 0; // integral of x^2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = p[2 * i];
    const y0 = p[2 * i + 1];
    const x1 = p[2 * j];
    const y1 = p[2 * j + 1];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
    ixx += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    iyy += (x0 * x0 + x0 * x1 + x1 * x1) * c;
  }
  a /= 2;
  cx /= 6 * a;
  cy /= 6 * a;
  ixx = ixx / 12 - a * cy * cy;
  iyy = iyy / 12 - a * cx * cx;
  return { area: a, cx, cy, ixx, iyy };
}

// Mass properties of one collider spec at a density, in the collider's own
// frame. Computed from the true (unrounded) solid: Rapier's round shapes
// report only the mass of their inner core.
function massProps(spec, density) {
  const zero = { x: 0, y: 0, z: 0 };
  switch (spec.type) {
    case 'cuboid': {
      const [x, y, z] = spec.half;
      const m = density * 8 * x * y * z;
      return { mass: m, com: zero, inertia: { x: (m * (y * y + z * z)) / 3, y: (m * (x * x + z * z)) / 3, z: (m * (x * x + y * y)) / 3 } };
    }
    case 'cylinder': {
      const r = spec.radius;
      const h = spec.halfHeight;
      const m = density * Math.PI * r * r * 2 * h;
      const side = (m * (3 * r * r + 4 * h * h)) / 12;
      return { mass: m, com: zero, inertia: { x: side, y: (m * r * r) / 2, z: side } };
    }
    case 'ball': {
      const r = spec.radius;
      const m = density * (4 / 3) * Math.PI * r ** 3;
      const i = 0.4 * m * r * r;
      return { mass: m, com: zero, inertia: { x: i, y: i, z: i } };
    }
    case 'capsule': {
      const r = spec.radius;
      const h = spec.halfHeight;
      const mc = density * Math.PI * r * r * 2 * h;
      const ms = density * (4 / 3) * Math.PI * r ** 3;
      const iy = (mc * r * r) / 2 + 0.4 * ms * r * r;
      const ix = (mc * (3 * r * r + 4 * h * h)) / 12 + ms * (0.4 * r * r + h * h + 0.75 * h * r);
      return { mass: mc + ms, com: zero, inertia: { x: ix, y: iy, z: ix } };
    }
    case 'hull': {
      const prism = prismOutline(spec.points);
      if (prism) {
        const d = prism.zMax - prism.zMin;
        const pm = polygonMoments(prism.poly);
        const m = density * pm.area * d;
        return {
          mass: m,
          com: { x: pm.cx, y: pm.cy, z: (prism.zMax + prism.zMin) / 2 },
          inertia: {
            x: density * d * pm.ixx + (m * d * d) / 12,
            y: density * d * pm.iyy + (m * d * d) / 12,
            z: density * d * (pm.ixx + pm.iyy),
          },
        };
      }
      // Any other hull: treat it as its bounding box (tools only).
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < spec.points.length; i++) {
        lo[i % 3] = Math.min(lo[i % 3], spec.points[i]);
        hi[i % 3] = Math.max(hi[i % 3], spec.points[i]);
      }
      const half = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
      const box = massProps({ type: 'cuboid', half }, density);
      box.mass *= 0.6; // a hull fills roughly this much of its box
      box.com = { x: (hi[0] + lo[0]) / 2, y: (hi[1] + lo[1]) / 2, z: (hi[2] + lo[2]) / 2 };
      return box;
    }
    default:
      throw new Error(`physics: unknown collider type ${spec.type}`);
  }
}

// A Rapier ColliderDesc for a shapes.js-style spec, with edges eased by
// `round` (the rounded shape's outer size matches the spec).
function colliderDesc(spec, round) {
  const C = RAPIER.ColliderDesc;
  switch (spec.type) {
    case 'cuboid': {
      const [x, y, z] = spec.half;
      const r = Math.min(round, x * 0.5, y * 0.5, z * 0.5);
      return r > 0 ? C.roundCuboid(x - r, y - r, z - r, r) : C.cuboid(x, y, z);
    }
    case 'cylinder': {
      const r = Math.min(round, spec.radius * 0.5, spec.halfHeight * 0.5);
      return r > 0 ? C.roundCylinder(spec.halfHeight - r, spec.radius - r, r) : C.cylinder(spec.halfHeight, spec.radius);
    }
    case 'ball':
      return C.ball(spec.radius);
    case 'capsule':
      return C.capsule(spec.halfHeight, spec.radius);
    case 'hull': {
      const prism = round > 0 ? prismOutline(spec.points) : null;
      if (prism) {
        // Shrink the prism by the edge radius so the rounded hull keeps the
        // block's true outer size.
        const d = C.roundConvexHull(prismPoints(insetPolygon(prism.poly, round), prism, round), round);
        if (d) return d;
      }
      return C.convexHull(new Float32Array(spec.points));
    }
    default:
      throw new Error(`physics: unknown collider type ${spec.type}`);
  }
}

// The Rapier colliders for one spec: [{ desc, share }] where share is the
// part of the spec's mass the collider carries.
//
// A rounded cylinder is split in two. Rapier's rounded cylinder stands on
// its ends beautifully, but lying on its side it never stops rolling: its
// side contact creeps at ~0.35 mm per step (8 cm/s at 240 Hz) and even
// starts from rest, whatever the damping. A many-sided prism rolls and stops
// like real wood but jitters standing on its many-cornered end. So the ends
// are a rounded cylinder 1 mm slimmer than the block and the side is a
// massless 32-sided prism 1 mm shorter: in each pose only one of them
// touches (the gap is wider than Rapier's contact prediction distance).
//
// A rounded prism whose end face has more than four corners (the
// half-round's D) is sliced the same way: Rapier's contact manifold keeps
// at most four points of one face, and standing on a many-cornered face
// the chosen points flicker so the block rocks for ever. Slices of at most
// four corners stand still. Only the outer outline is inset, so the rounded
// slices meet flush.
function colliderParts(spec, round) {
  const C = RAPIER.ColliderDesc;
  if (spec.type === 'hull' && round > 0) {
    const prism = prismOutline(spec.points);
    if (prism && prism.poly.length > 8) {
      const inner = insetPolygon(prism.poly, round);
      const out = [];
      for (const piece of slicePolygon(inner)) {
        const desc = C.roundConvexHull(prismPoints(piece, prism, round), round);
        if (!desc) return [{ desc: colliderDesc(spec, round), share: 1 }];
        out.push({ desc, share: out.length ? 0 : 1 });
      }
      return out;
    }
  }
  const r = spec.type === 'cylinder' ? Math.min(round, spec.radius * 0.5, spec.halfHeight * 0.5) : 0;
  if (r <= 0) return [{ desc: colliderDesc(spec, round), share: 1 }];
  const n = CYLINDER_SIDES;
  const rec = CYLINDER_RECESS;
  const side = Math.min(r, 0.001); // softer edges on the rolling prism
  const rr = (spec.radius - side) / Math.cos(Math.PI / n); // flats touch the true radius
  const h = spec.halfHeight - rec - side;
  const pts = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    pts.set([Math.cos(a) * rr, -h, Math.sin(a) * rr, Math.cos(a) * rr, h, Math.sin(a) * rr], i * 6);
  }
  const ends = C.roundCylinder(spec.halfHeight - r, spec.radius - rec - r, r);
  const prism = C.roundConvexHull(pts, side);
  // The flat part of each end face, for the support check.
  const cap = { r: spec.radius - rec - r, h: spec.halfHeight };
  return prism ? [{ desc: ends, share: 1, cap }, { desc: prism, share: 0 }] : [{ desc: ends, share: 1, cap }];
}

// Local points whose highest one is the top of a posed shape (corners of
// boxes, rims of cylinders, hull points).
function extentPoints(specs) {
  const out = [];
  for (const s of specs) {
    const o = s.offset || [0, 0, 0];
    if (s.type === 'cuboid') {
      const [x, y, z] = s.half;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(o[0] + sx * x, o[1] + sy * y, o[2] + sz * z);
    } else if (s.type === 'cylinder') {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        for (const sy of [-1, 1]) out.push(o[0] + Math.cos(a) * s.radius, o[1] + sy * s.halfHeight, o[2] + Math.sin(a) * s.radius);
      }
    } else if (s.type === 'hull') {
      for (let i = 0; i < s.points.length; i += 3) out.push(o[0] + s.points[i], o[1] + s.points[i + 1], o[2] + s.points[i + 2]);
    } else {
      const r = s.radius;
      const h = s.type === 'capsule' ? s.halfHeight + r : r;
      out.push(o[0], o[1] + h, o[2], o[0], o[1] - h, o[2], o[0] + r, o[1], o[2], o[0] - r, o[1], o[2], o[0], o[1], o[2] + r, o[0], o[1], o[2] - r);
    }
  }
  return new Float64Array(out);
}

// Load-sharing weights: how much of a load at c goes to each supporter,
// whose contact centroids are g[0..n). Minimum-change weights (closest to
// an even split) that put the combined point exactly on c, never negative:
// two supporters reduce to the lever rule.
const W_MAX = 64;
const wScratch = new Float64Array(W_MAX);
const activeScratch = new Uint8Array(W_MAX);
function shareLoad(n, gx, gz, cx, cz, w) {
  if (n === 1) {
    w[0] = 1;
    return;
  }
  const S = 0.02; // scale coordinates to ~1 for a well-conditioned solve
  const act = activeScratch;
  for (let i = 0; i < n; i++) act[i] = 1;
  let k = n;
  for (let iter = 0; iter <= n; iter++) {
    for (let i = 0; i < n; i++) w[i] = 0;
    if (k === 1) {
      for (let i = 0; i < n; i++) if (act[i]) w[i] = 1;
      return;
    }
    if (k === 2) {
      let a = -1;
      let b = -1;
      for (let i = 0; i < n; i++) if (act[i]) (a < 0 ? (a = i) : (b = i));
      const ex = gx[b] - gx[a];
      const ez = gz[b] - gz[a];
      const l2 = ex * ex + ez * ez;
      let t = l2 > 1e-12 ? ((cx - gx[a]) * ex + (cz - gz[a]) * ez) / l2 : 0.5;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      w[a] = 1 - t;
      w[b] = t;
      return;
    }
    // Solve min |w - 1/k|^2 subject to sum w = 1 and sum w (g - c) = 0.
    let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = 0, sx = 0, sz = 0;
    for (let i = 0; i < n; i++) {
      if (!act[i]) continue;
      const dx = (gx[i] - cx) / S;
      const dz = (gz[i] - cz) / S;
      m00 += 1;
      m01 += dx;
      m02 += dz;
      m11 += dx * dx;
      m12 += dx * dz;
      m22 += dz * dz;
      sx += dx;
      sz += dz;
    }
    const eps = 1e-6;
    m11 += eps;
    m22 += eps;
    // residual of the even split: b - A w0 = (0, -sx/k, -sz/k)
    const r1 = -sx / k;
    const r2 = -sz / k;
    const det = m00 * (m11 * m22 - m12 * m12) - m01 * (m01 * m22 - m12 * m02) + m02 * (m01 * m12 - m11 * m02);
    if (Math.abs(det) < 1e-12) {
      for (let i = 0; i < n; i++) w[i] = act[i] ? 1 / k : 0;
      return;
    }
    // lambda = M^-1 (0, r1, r2) using the adjugate
    const i01 = -(m01 * m22 - m02 * m12);
    const i02 = m01 * m12 - m02 * m11;
    const i11 = m00 * m22 - m02 * m02;
    const i12 = -(m00 * m12 - m01 * m02);
    const i22 = m00 * m11 - m01 * m01;
    const l0 = (i01 * r1 + i02 * r2) / det;
    const l1 = (i11 * r1 + i12 * r2) / det;
    const l2 = (i12 * r1 + i22 * r2) / det;
    let worst = -1;
    let worstW = 0;
    for (let i = 0; i < n; i++) {
      if (!act[i]) continue;
      const wi = 1 / k + l0 + l1 * ((gx[i] - cx) / S) + l2 * ((gz[i] - cz) / S);
      w[i] = wi;
      if (wi < worstW) {
        worstW = wi;
        worst = i;
      }
    }
    if (worst < 0) return;
    act[worst] = 0;
    k--;
  }
}

// ---- the world --------------------------------------------------------------

export class Physics {
  // options: floor { friction, restitution, kind }, hz (steps per second;
  // 240 by default, 180 is a fair saving on weak phones), maxSubsteps (per
  // step() call) and budgetMs (real time per step() call; Infinity makes
  // runs repeatable, which tests want).
  constructor({ floor = {}, hz = HZ, maxSubsteps = MAX_SUBSTEPS, budgetMs = STEP_BUDGET_MS } = {}) {
    this.RAPIER = RAPIER;
    const world = new RAPIER.World({ x: 0, y: -G, z: 0 });
    world.lengthUnit = LENGTH_UNIT;
    this._hz = hz;
    this._dt = 1 / hz;
    world.timestep = this._dt;
    world.integrationParameters.contact_natural_frequency = hz * CONTACT_SHARE;
    this.world = world;
    this.queue = new RAPIER.EventQueue(true);

    this._nextId = 2;
    this._owners = new Map(); // collider handle -> owner (handle, floor or wall)
    this._caps = new Map(); // collider handle -> flat end face of a block cylinder
    this._blocks = [];
    this._bodies = []; // tool bodies from addBody
    this._movers = []; // handles whose bodies can move (interpolated)
    this._moversDirty = true;
    this._held = [];
    this._pairs = new Map();
    this._listeners = {};
    this._out = [];
    this._inStep = false;

    this._maxSubsteps = maxSubsteps;
    this._budgetMs = budgetMs;
    this._acc = 0;
    this._alpha = 0;
    this._time = 0;
    this._stepCount = 0;
    this._dirty = false;
    this._verify = [];
    this._pruned = 0;
    this._stab = { value: 1, weakest: null };
    this._height = 0;
    this.stats = { steps: 0, ms: 0, frozen: 0, free: 0 };

    // scratch objects reused every step
    this._v = { x: 0, y: 0, z: 0 };
    this._w = { x: 0, y: 0, z: 0 };
    this._q = { x: 0, y: 0, z: 0, w: 1 };
    this._f = { x: 0, y: 0, z: 0 };
    this._n = { x: 0, y: 0, z: 0 };
    this._p = { x: 0, y: 0, z: 0 };
    this._zero = { x: 0, y: 0, z: 0 };
    this._near = new Float64Array(2);
    this._knocks = [];
    this._kinKnocks = [];
    this._cands = []; // impact candidates found in the current substep
    this._impacts = []; // impacts to emit this frame
    this._pairTmp = [];
    this._candList = [];
    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

    // Floor: a big slab whose top is y = 0. Its restitution uses the Min
    // rule so a rug really deadens bounces.
    const fb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this._floorOwner = { id: 0, kind: 'floor', state: 'fixed', mass: Infinity, material: 'wood', _e: 0.3, _last: -1 };
    this._wallOwner = { id: 1, kind: 'wall', state: 'fixed', mass: Infinity, material: 'wood', _e: 0, _last: -1 };
    this._floorCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(10, 0.5, 10)
        .setTranslation(0, -0.5, 0)
        .setCollisionGroups(groups(G_FLOOR, 0xffff))
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
      fb,
    );
    this._owners.set(this._floorCollider.handle, this._floorOwner);
    // Soft invisible walls: no bounce, little grip, so strays just stop.
    for (const [x, z, hx, hz] of [
      [WALL_DIST + 0.1, 0, 0.1, WALL_DIST + 0.2],
      [-WALL_DIST - 0.1, 0, 0.1, WALL_DIST + 0.2],
      [0, WALL_DIST + 0.1, WALL_DIST + 0.2, 0.1],
      [0, -WALL_DIST - 0.1, WALL_DIST + 0.2, 0.1],
    ]) {
      const c = world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, WALL_HEIGHT / 2, hz)
          .setTranslation(x, WALL_HEIGHT / 2, z)
          .setFriction(0.2)
          .setRestitution(0)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setCollisionGroups(groups(G_WALL, 0xffff)),
        fb,
      );
      this._owners.set(c.handle, this._wallOwner);
    }
    this.setFloor(floor);

    this._onForce = (ev) => this._forceEvent(ev);
    this._onCollision = (h1, h2, started) => this._collisionEvent(h1, h2, started);
    this._rayFilter = (collider) => {
      const o = this._owners.get(collider.handle);
      if (!o) return false;
      if (o.kind === 'floor') return true;
      if (o.kind !== 'block' || o === this._rayExclude) return false;
      return this._rayAll || (o.state !== 'held' && o.state !== 'kinematic');
    };
    this._rayExclude = null;
    this._rayAll = true;
  }

  // ---- setup ----------------------------------------------------------------

  setFloor({ friction = 0.5, restitution = 0.3, kind = 'wood' } = {}) {
    this._floorCollider.setFriction(friction);
    this._floorCollider.setRestitution(restitution);
    this._floorOwner.material = kind;
    this._floorOwner._e = restitution;
  }

  addBlock(shapeId, opts = {}) {
    const shape = SHAPES[shapeId];
    if (!shape) throw new Error(`physics: unknown shape ${shapeId}`);
    const material = opts.material === 'paint' ? 'paint' : 'wood';
    const mat = MATERIALS[material];
    const h = this._makeHandle('block', shapeId, material, opts, shape.colliders);
    h._e = mat.restitution;
    const body = this._createBody('dynamic', opts, DAMP_LIN, DAMP_ANG, 1, false);
    h.body = body;
    let mass = 0;
    for (const spec of shape.colliders) {
      const mp = massProps(spec, DENSITY);
      mass += mp.mass;
      const o = spec.offset || [0, 0, 0];
      for (const { desc, share, cap } of colliderParts(spec, EDGE)) {
        const k = share || 1e-9;
        desc
          .setTranslation(o[0], o[1], o[2])
          .setMassProperties(mp.mass * k, mp.com, { x: mp.inertia.x * k, y: mp.inertia.y * k, z: mp.inertia.z * k }, { x: 0, y: 0, z: 0, w: 1 })
          .setFriction(mat.friction)
          .setRestitution(mat.restitution)
          .setCollisionGroups(groups(G_BLOCK, 0xffff))
          .setActiveEvents(AE())
          .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED);
        const c = this.world.createCollider(desc, body);
        h.colliders.push(c);
        this._owners.set(c.handle, h);
        if (cap) this._caps.set(c.handle, cap);
      }
    }
    h.mass = mass;
    // Force events only above ~1.2x its weight: resting contacts stay quiet.
    for (const c of h.colliders) c.setContactForceEventThreshold(1.2 * mass * G + 0.1);
    this._readPose(h);
    h._prev.set(h._cur);
    // frozen: true (a preset) freezes on the first frame it has support.
    h._asap = !!opts.frozen;
    this._blocks.push(h);
    this._moversDirty = true;
    return h;
  }

  // Generic body for tools: { colliders: [shapes.js-style specs, plus
  // {type:'ball', radius} and {type:'capsule', halfHeight, radius}, each
  // with optional offset [x,y,z] and rotation [x,y,z,w]], position,
  // quaternion, velocity, angularVelocity, type: 'dynamic'|'kinematic'|
  // 'fixed', density | mass, friction, restitution, linearDamping,
  // angularDamping, gravityScale, ccd, round (edge radius), material
  // ('rubber', 'wood', 'metal', ... for impact sounds), walls (false: pass
  // through the boundary walls), userData }.
  addBody(spec) {
    const type = spec.type || 'dynamic';
    const h = this._makeHandle('body', null, spec.material || 'wood', spec, spec.colliders);
    h._e = spec.restitution ?? 0.3;
    const body = this._createBody(
      type,
      spec,
      spec.linearDamping ?? DAMP_LIN,
      spec.angularDamping ?? DAMP_ANG,
      spec.gravityScale ?? 1,
      !!spec.ccd,
    );
    h.body = body;
    h.state = type === 'dynamic' ? 'free' : type === 'kinematic' ? 'kinematic' : 'fixed';
    const density = spec.density ?? DENSITY;
    const parts = spec.colliders.map((s) => massProps(s, density));
    const total = parts.reduce((a, p) => a + p.mass, 0);
    const scale = spec.mass ? spec.mass / total : 1;
    const filter = spec.walls === false ? 0xffff & ~G_WALL : 0xffff;
    let mass = 0;
    spec.colliders.forEach((s, i) => {
      const mp = parts[i];
      const o = s.offset || [0, 0, 0];
      const m = mp.mass * scale;
      mass += m;
      const inertia = { x: mp.inertia.x * scale, y: mp.inertia.y * scale, z: mp.inertia.z * scale };
      const d = colliderDesc(s, spec.round || 0)
        .setTranslation(o[0], o[1], o[2])
        .setMassProperties(m, mp.com, inertia, { x: 0, y: 0, z: 0, w: 1 })
        .setFriction(spec.friction ?? 0.6)
        .setRestitution(spec.restitution ?? 0.3)
        .setCollisionGroups(groups(G_TOOL, filter))
        .setActiveEvents(AE());
      if (s.rotation) d.setRotation({ x: s.rotation[0], y: s.rotation[1], z: s.rotation[2], w: s.rotation[3] });
      const c = this.world.createCollider(d, body);
      h.colliders.push(c);
      this._owners.set(c.handle, h);
    });
    h.mass = type === 'dynamic' ? mass : Infinity;
    for (const c of h.colliders) c.setContactForceEventThreshold(1.2 * mass * G + 0.1);
    this._readPose(h);
    h._prev.set(h._cur);
    this._bodies.push(h);
    this._moversDirty = true;
    return h;
  }

  remove(h) {
    if (!h || h.state === 'removed') return;
    if (h.kind === 'block' && h.state === 'frozen') {
      // Whatever rested on it has to fall now.
      const up = this._closureUp([h]);
      up.delete(h);
      if (up.size) this._unfreeze(up, 'manual', 0);
    }
    for (const c of h.colliders) {
      this._owners.delete(c.handle);
      this._caps.delete(c.handle);
    }
    this.world.removeRigidBody(h.body);
    const list = h.kind === 'block' ? this._blocks : this._bodies;
    const i = list.indexOf(h);
    if (i >= 0) list.splice(i, 1);
    const j = this._held.indexOf(h);
    if (j >= 0) this._held.splice(j, 1);
    h.state = 'removed';
    this._dirty = true;
    this._moversDirty = true;
  }

  // Remove every block (tool bodies stay).
  clear() {
    for (const h of this._blocks) {
      for (const c of h.colliders) {
        this._owners.delete(c.handle);
        this._caps.delete(c.handle);
      }
      this.world.removeRigidBody(h.body);
      h.state = 'removed';
    }
    this._blocks.length = 0;
    this._held = this._held.filter((h) => h.kind !== 'block');
    this._verify.length = 0;
    this._pairs.clear();
    this._dirty = true;
    this._moversDirty = true;
  }

  // ---- stepping ---------------------------------------------------------------

  step(realDt, timeScale = 1) {
    const t0 = performance.now();
    this._inStep = true;
    if (!(realDt > 0)) realDt = 0;
    this._acc += Math.min(realDt, 0.1) * timeScale;
    let n = 0;
    while (this._acc >= this._dt) {
      if (n >= this._maxSubsteps || (n > 0 && performance.now() - t0 > this._budgetMs)) {
        // Can't keep up: drop the backlog so the simulation slows down.
        this._acc = Math.min(this._acc, this._dt * 0.999);
        break;
      }
      this._substep();
      this._acc -= this._dt;
      n++;
    }
    this._alpha = this._acc / this._dt;
    if (n) this._bookkeep(n * this._dt);
    this._inStep = false;
    this._flushImpacts();
    this._dispatch();
    this.stats.steps = n;
    this.stats.ms = performance.now() - t0;
    return n;
  }

  _substep() {
    if (this._moversDirty) this._rebuildMovers();
    const movers = this._movers;
    for (let i = 0; i < movers.length; i++) movers[i]._prev.set(movers[i]._cur);
    for (let i = 0; i < this._held.length; i++) this._drive(this._held[i]);
    this.world.step(this.queue);
    this._stepCount++;
    this._time += this._dt;
    for (let i = 0; i < movers.length; i++) this._readPose(movers[i]);
    this._knocks.length = 0;
    this._kinKnocks.length = 0;
    this._cands.length = 0;
    this.queue.drainCollisionEvents(this._onCollision);
    this.queue.drainContactForceEvents(this._onForce);
    if (this._knocks.length || this._kinKnocks.length) this._applyKnocks();
    if (this._cands.length) this._collectImpacts();
  }

  _rebuildMovers() {
    this._movers.length = 0;
    for (const h of this._blocks) if (h.state !== 'frozen') this._movers.push(h);
    for (const h of this._bodies) if (h.state !== 'fixed') this._movers.push(h);
    this._moversDirty = false;
  }

  _readPose(h) {
    const t = h.body.translation(this._v);
    const r = h.body.rotation(this._q);
    const c = h._cur;
    c[0] = t.x;
    c[1] = t.y;
    c[2] = t.z;
    c[3] = r.x;
    c[4] = r.y;
    c[5] = r.z;
    c[6] = r.w;
  }

  // Write the interpolated pose into position (x, y, z) and quaternion
  // (x, y, z, w); THREE objects are fine (set() is used when present).
  pose(h, position, quaternion) {
    const a = this._alpha;
    const p = h._prev;
    const c = h._cur;
    if (position) {
      const x = p[0] + (c[0] - p[0]) * a;
      const y = p[1] + (c[1] - p[1]) * a;
      const z = p[2] + (c[2] - p[2]) * a;
      if (position.set) position.set(x, y, z);
      else {
        position.x = x;
        position.y = y;
        position.z = z;
      }
    }
    if (quaternion) {
      let bx = c[3];
      let by = c[4];
      let bz = c[5];
      let bw = c[6];
      if (p[3] * bx + p[4] * by + p[5] * bz + p[6] * bw < 0) {
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
      }
      let x = p[3] + (bx - p[3]) * a;
      let y = p[4] + (by - p[4]) * a;
      let z = p[5] + (bz - p[5]) * a;
      let w = p[6] + (bw - p[6]) * a;
      const l = 1 / (Math.hypot(x, y, z, w) || 1);
      x *= l;
      y *= l;
      z *= l;
      w *= l;
      if (quaternion.set) quaternion.set(x, y, z, w);
      else {
        quaternion.x = x;
        quaternion.y = y;
        quaternion.z = z;
        quaternion.w = w;
      }
    }
  }

  // ---- contact events -----------------------------------------------------

  _ownerOf(ch) {
    let o = this._owners.get(ch);
    if (o) return o;
    // A collider made directly on the world (e.g. a tool's joint anchor):
    // remember it so events can still be classified.
    const c = this.world.getCollider(ch);
    const b = c && c.parent();
    const fixed = !b || b.isFixed();
    o = { id: this._nextId++, kind: 'other', state: fixed ? 'fixed' : b.isKinematic() ? 'kinematic' : 'free', mass: fixed ? Infinity : b.mass(), material: 'wood', body: b, _e: 0.3, _last: -1, _push: 0, _pushT: 0 };
    this._owners.set(ch, o);
    return o;
  }

  _collisionEvent(h1, h2, started) {
    if (!started) return;
    const a = this._ownerOf(h1);
    const b = this._ownerOf(h2);
    // A kinematic tool touching a frozen block: fixed and kinematic bodies
    // never push each other, so wake the block and let the tool shove it.
    if (a.state === 'frozen' && (b.kind === 'body' || b.kind === 'other') && b.state === 'kinematic') this._kinKnocks.push(a);
    else if (b.state === 'frozen' && (a.kind === 'body' || a.kind === 'other') && a.state === 'kinematic') this._kinKnocks.push(b);
  }

  _forceEvent(ev) {
    const c1 = ev.collider1();
    const c2 = ev.collider2();
    const a = this._ownerOf(c1);
    const b = this._ownerOf(c2);
    if (a.kind === 'wall' || b.kind === 'wall') return;
    const f = ev.totalForce(this._f); // the force on collider2
    const jx = f.x * this._dt;
    const jy = f.y * this._dt;
    const jz = f.z * this._dt;
    const jmag = ev.totalForceMagnitude() * this._dt;
    if (a.state === 'frozen' && (b.state === 'free' || b.state === 'held')) this._knockCheck(a, b, -jx, -jy, -jz, c1, c2);
    else if (b.state === 'frozen' && (a.state === 'free' || a.state === 'held')) this._knockCheck(b, a, jx, jy, jz, c2, c1);

    // Impacts: a spike over the pair's steady contact force.
    const key = a.id < b.id ? a.id * 2097152 + b.id : b.id * 2097152 + a.id;
    let pair = this._pairs.get(key);
    if (!pair) {
      pair = { base: 0, step: -10, emitted: -1 };
      this._pairs.set(key, pair);
    }
    const fresh = pair.step < this._stepCount - 1;
    const base = fresh ? 0 : pair.base;
    pair.base = fresh ? jmag : base * 0.5 + jmag * 0.5;
    pair.step = this._stepCount;
    const dj = jmag - base * 1.25;
    if (dj <= 0) return;
    if (a.kind === 'other' || b.kind === 'other') return;
    const inv = this._invMass(a) + this._invMass(b);
    if (inv === 0) return;
    // impulse = reduced mass x (1 + e) x approach speed; the floor's own
    // restitution wins (Min rule), blocks average.
    const e = a.kind === 'floor' ? Math.min(a._e, b._e) : b.kind === 'floor' ? Math.min(a._e, b._e) : (a._e + b._e) / 2;
    const speed = (dj * inv) / (1 + e);
    if (speed < IMPACT_MIN_SPEED) return;
    if (this._time - pair.emitted < PAIR_COOLDOWN) return;
    if ((a.kind !== 'floor' && this._time - a._last < BODY_COOLDOWN) || (b.kind !== 'floor' && this._time - b._last < BODY_COOLDOWN)) return;
    pair.emitted = this._time;
    if (a.kind !== 'floor') a._last = this._time;
    if (b.kind !== 'floor') b._last = this._time;
    if (this._cands.length < 16) this._cands.push({ a, b, c1, c2, speed, impulse: dj });
  }

  _invMass(o) {
    return o.state === 'free' || o.state === 'held' ? 1 / o.mass : 0;
  }

  _knockCheck(frozen, other, jx, jy, jz, cf, co) {
    const jh = Math.hypot(jx, jz);
    const limH = (other.state === 'held' ? HELD_KNOCK_DVH : KNOCK_DVH) * frozen.mass;
    let knock = jh >= limH || Math.abs(jy) >= KNOCK_DVV * frozen.mass;
    if (!knock && other.kind !== 'block') {
      frozen._push = frozen._push * Math.exp(-(this._time - frozen._pushT) / PUSH_MEMORY) + jh;
      frozen._pushT = this._time;
      knock = frozen._push >= PUSH_DVH * frozen.mass;
    }
    if (!knock) return;
    frozen._push = 0;
    if (this._knocks.length < 16) this._knocks.push({ frozen, other, jx, jy, jz, cf, co });
  }

  // Wake knocked blocks and hand back the momentum the fixed body
  // swallowed: in the fixed collision the mover got impulse J back; in a
  // free collision each body would get J * mF / (mF + mX).
  _applyKnocks() {
    for (const f of this._kinKnocks) if (f.state === 'frozen') this._wakeUp([f], 'knock', KNOCK_NO_FREEZE);
    for (const k of this._knocks) {
      const F = k.frozen;
      const X = k.other;
      if (F.state === 'frozen') this._wakeUp([F], 'knock', KNOCK_NO_FREEZE);
      F._slack = 0;
      const mF = F.mass;
      const mX = X.mass;
      const kF = mF / (mF + mX);
      const kX = mX / (mF + mX);
      const p = this._contactPoint(k.cf, k.co, F);
      this._v.x = k.jx * kF;
      this._v.y = k.jy * kF;
      this._v.z = k.jz * kF;
      F.body.applyImpulseAtPoint(this._v, p, true);
      if (X.state === 'free') {
        this._v.x = k.jx * kX;
        this._v.y = k.jy * kX;
        this._v.z = k.jz * kX;
        X.body.applyImpulse(this._v, true);
      }
    }
  }

  // Average solver contact point between two colliders (world space), or the
  // fallback body's position.
  _contactPoint(c1, c2, fallback) {
    const p = this._p;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    this.world.narrowPhase.contactPair(c1, c2, this.world.bodies, (m) => {
      const ns = m.numSolverContacts();
      for (let i = 0; i < ns; i++) {
        const q = m.solverContactPoint(i, this._n);
        if (!q) continue;
        sx += q.x;
        sy += q.y;
        sz += q.z;
        n++;
      }
    });
    if (n) {
      p.x = sx / n;
      p.y = sy / n;
      p.z = sz / n;
    } else if (fallback && fallback._cur) {
      p.x = fallback._cur[0];
      p.y = fallback._cur[1];
      p.z = fallback._cur[2];
    } else {
      p.x = p.y = p.z = 0;
    }
    return p;
  }

  _collectImpacts() {
    for (const c of this._cands) {
      const p = this._contactPoint(c.c1, c.c2, c.a.kind === 'floor' ? c.b : c.a);
      const ev = {
        a: c.a.kind === 'floor' ? null : c.a,
        b: c.b.kind === 'floor' ? null : c.b,
        point: { x: p.x, y: p.y, z: p.z },
        speed: c.speed,
        impulse: c.impulse,
        strength: Math.min(1, c.speed / 1.5),
        materials: [c.a.material, c.b.material],
      };
      if (this._impacts.length < MAX_IMPACTS) this._impacts.push(ev);
      else {
        let weakest = 0;
        for (let i = 1; i < this._impacts.length; i++) if (this._impacts[i].speed < this._impacts[weakest].speed) weakest = i;
        if (this._impacts[weakest].speed < ev.speed) this._impacts[weakest] = ev;
      }
    }
  }

  _flushImpacts() {
    for (const ev of this._impacts) this._emit('impact', ev);
    this._impacts.length = 0;
  }

  // ---- settle, freeze, balance -----------------------------------------------

  _bookkeep(simDt) {
    const t = this._time;
    const cands = this._candList;
    cands.length = 0;
    const cl2 = CALM_LIN * CALM_LIN;
    const ca2 = CALM_ANG * CALM_ANG;
    const ql2 = QUICK_LIN * QUICK_LIN;
    const qa2 = QUICK_ANG * QUICK_ANG;
    const qf2 = QUICK_FALL * QUICK_FALL;
    for (const h of this._blocks) {
      if (h.state !== 'free') continue;
      const b = h.body;
      let h2 = 0;
      let vy2 = 0;
      let w2 = 0;
      if (!b.isSleeping()) {
        const v = b.linvel(this._v);
        const w = b.angvel(this._w);
        h2 = v.x * v.x + v.z * v.z;
        vy2 = v.y * v.y;
        w2 = w.x * w.x + w.y * w.y + w.z * w.z;
      }
      const v2 = h2 + vy2;
      // A woken block that starts really moving loses its quick pass.
      if (h._quick && (h2 > ql2 || vy2 > qf2 || w2 > qa2)) h._quick = false;
      const calm = h._quick || (v2 < cl2 && w2 < ca2);
      h._calm = calm ? h._calm + simDt : 0;
      if (!calm) h._refused = 0;
      if (!h._tired && t - h._freeSince > TIRED_TIME) {
        h._tired = true;
        b.setLinearDamping(TIRED_LIN);
        b.setAngularDamping(TIRED_ANG);
      }
      this._rescue(h);
      const need = h._quick ? QUICK_TIME : SETTLE_TIME;
      if ((h._calm >= need || h._asap) && t >= h._noFreezeUntil) cands.push(h);
    }
    if (cands.length) this._freezeCandidates(cands);
    if (this._verify.length) this._checkVerify();
    if (this._dirty) this._analyse();
    // Forget pairs that have not touched for a while.
    if (t - this._pruned > 2) {
      this._pruned = t;
      for (const [k, p] of this._pairs) if (p.step < this._stepCount - this._hz * 2) this._pairs.delete(k);
    }
  }

  // Put back a block that escaped the walls or sank through the floor.
  _rescue(h) {
    const c = h._cur;
    if (c[1] > -0.1 && Math.abs(c[0]) < RESCUE_DIST && Math.abs(c[2]) < RESCUE_DIST) return;
    const lim = WALL_DIST - 0.1;
    this._v.x = Math.max(-lim, Math.min(lim, c[0]));
    this._v.y = 0.06;
    this._v.z = Math.max(-lim, Math.min(lim, c[2]));
    h.body.setTranslation(this._v, true);
    h.body.setLinvel(this._zero, true);
    h.body.setAngvel(this._zero, true);
    this._readPose(h);
    h._prev.set(h._cur);
  }

  // Read what a free block touches: supports from below (with the contact
  // points), sideways props, and which of them are not frozen yet.
  _readSupports(h) {
    h._supAt = this._time;
    h._sup.length = 0;
    h._deps.length = 0;
    h._lateral = false;
    const minImp = LOAD_FRACTION * h.mass * G * this._dt;
    const np = this.world.narrowPhase;
    const bodies = this.world.bodies;
    for (const col of h.colliders) {
      const ch = col.handle;
      const others = this._pairTmp;
      others.length = 0;
      np.contactPairsWith(ch, (oh) => others.push(oh));
      for (const oh of others) {
        const o = this._ownerOf(oh);
        if (o === h) continue;
        np.contactPair(ch, oh, bodies, (m, flipped) => {
          const ns = m.numSolverContacts();
          if (!ns) return;
          let imp = 0;
          const nc = m.numContacts();
          for (let i = 0; i < nc; i++) imp += m.contactImpulse(i);
          if (imp < minImp) return;
          const nrm = m.normal(this._n);
          const ny = flipped ? nrm.y : -nrm.y; // normal pointing from o into h
          if (ny < -0.3) return; // o rests on h, not the other way round
          let e = null;
          for (const s of h._sup) if (s.o === o) e = s;
          if (!e) {
            e = { o, vertical: false, pts: [], gx: 0, gz: 0 };
            h._sup.push(e);
          }
          if (ny > 0.5) {
            e.vertical = true;
            for (let i = 0; i < ns; i++) {
              const q = m.solverContactPoint(i, this._p);
              if (q) e.pts.push(q.x, q.y, q.z);
            }
            // Rapier reports a round end face as 4-8 points on its rim,
            // whose hull is much smaller than the face: add the rim points
            // that really rest on the other body.
            const nx = flipped ? nrm.x : -nrm.x;
            const nz = flipped ? nrm.z : -nrm.z;
            const myCap = this._caps.get(ch);
            const otherCap = this._caps.get(oh);
            if (myCap) this._capSamples(ch, myCap, -1, nx, ny, nz, oh, e.pts);
            if (otherCap) this._capSamples(oh, otherCap, 1, nx, ny, nz, ch, e.pts);
          } else {
            h._lateral = true;
          }
        });
      }
    }
    for (const s of h._sup) {
      const st = s.o.state;
      if (!(s.o.kind === 'floor' || s.o.kind === 'wall' || st === 'frozen' || st === 'fixed')) h._deps.push(s);
    }
  }

  // Sample the rim of the end face of cylinder collider `ch` that faces the
  // contact (side = -1: the face pointing against n, i.e. down onto a
  // support; +1: along n, up at the block resting on it) and keep the
  // points where collider `other` is within CAP_TOUCH of the face.
  _capSamples(ch, cap, side, nx, ny, nz, other, out) {
    const col = this.world.getCollider(ch);
    const oc = this.world.getCollider(other);
    if (!col || !oc) return;
    const t = col.translation();
    const q = col.rotation();
    // cylinder axis = local +y rotated into the world
    const ax = 2 * (q.x * q.y - q.w * q.z);
    const ay = 1 - 2 * (q.x * q.x + q.z * q.z);
    const az = 2 * (q.y * q.z + q.w * q.x);
    const dot = ax * nx + ay * ny + az * nz;
    if (Math.abs(dot) < 0.95) return; // not resting on an end face
    const sgn = side * Math.sign(dot);
    const cx = t.x + ax * cap.h * sgn;
    const cy = t.y + ay * cap.h * sgn;
    const cz = t.z + az * cap.h * sgn;
    // two directions across the face
    let ux = ay * 0 - az * 1;
    let uy = az * 0 - ax * 0;
    let uz = ax * 1 - ay * 0;
    if (Math.hypot(ux, uy, uz) < 0.1) {
      ux = 0;
      uy = az;
      uz = -ay;
    }
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = ay * uz - az * uy;
    const vy = az * ux - ax * uz;
    const vz = ax * uy - ay * ux;
    const p = this._p;
    for (let i = 0; i < CAP_SAMPLES; i++) {
      const a = (i / CAP_SAMPLES) * Math.PI * 2;
      const c = Math.cos(a) * cap.r;
      const d = Math.sin(a) * cap.r;
      p.x = cx + ux * c + vx * d;
      p.y = cy + uy * c + vy * d;
      p.z = cz + uz * c + vz * d;
      const pr = oc.projectPoint(p, true);
      if (pr && (pr.isInside || Math.hypot(pr.point.x - p.x, pr.point.y - p.y, pr.point.z - p.z) < CAP_TOUCH)) out.push(p.x, p.y, p.z);
    }
  }

  _freezeCandidates(cands) {
    const t = this._time;
    for (const h of cands) {
      if (h._asap || t - h._supAt >= RECHECK) this._readSupports(h);
      h._cand = h._sup.length > 0;
    }
    // Blocks that lean on or rest on each other may freeze together, but
    // never on anything still moving, held or driven.
    let changed = true;
    while (changed) {
      changed = false;
      for (const h of cands) {
        if (!h._cand) continue;
        for (const d of h._deps) {
          if (!(d.o.kind === 'block' && d.o._cand)) {
            h._cand = false;
            changed = true;
            break;
          }
        }
      }
    }
    const group = cands.filter((h) => h._cand);
    for (const h of cands) h._cand = false;
    if (!group.length) return;
    group.sort((a, b) => a._cur[1] - b._cur[1]); // bottom up
    const frozen = [];
    for (const h of group) if (this._freeze(h)) frozen.push(h);
    // Anything frozen on top of a block that refused to freeze goes back.
    let again = true;
    while (again) {
      again = false;
      for (const h of frozen) {
        if (h.state !== 'frozen') continue;
        for (const s of h._sup) {
          const o = s.o;
          if (o.kind === 'block' && o.state !== 'frozen') {
            this._thaw(h);
            again = true;
            break;
          }
        }
      }
    }
    for (const h of frozen) if (h.state === 'frozen') this._emit('settle', { handle: h });
  }

  _freeze(h) {
    // Support hull from the points of the supports below.
    const flat = [];
    for (const s of h._sup) {
      if (!s.vertical) continue;
      let sx = 0;
      let sz = 0;
      const n = s.pts.length / 3;
      if (!n) {
        s.vertical = false;
        continue;
      }
      for (let i = 0; i < s.pts.length; i += 3) {
        flat.push(s.pts[i], s.pts[i + 2]);
        sx += s.pts[i];
        sz += s.pts[i + 2];
      }
      s.gx = sx / n;
      s.gz = sz / n;
    }
    const com = h.body.worldCom();
    let hull = hull2(flat);
    let margin = hullDistance(hull, hull.length / 2, com.x, com.z);
    h._virtual = false;
    if (margin < -TOPPLE_TOL) {
      // Physics says it rests, the contacts disagree: trust physics a
      // little (leaning on a neighbour, a rocker on its curve) but not a
      // block that is only slowly tipping over, unless it stays calm for
      // STUCK_TRIES attempts (pinned by the blocks resting on it).
      if (-margin > VIRTUAL_MAX && !h._lateral && h._refused < STUCK_TRIES) {
        h._refused++;
        h._calm = 0;
        return false;
      }
      flat.push(com.x, com.z);
      hull = hull2(flat);
      margin = 0;
      h._virtual = true;
    }
    h._hull = hull;
    h._hullN = hull.length / 2;
    let gx = 0;
    let gz = 0;
    for (let i = 0; i < hull.length; i += 2) {
      gx += hull[i];
      gz += hull[i + 1];
    }
    const hn = Math.max(1, h._hullN);
    h._rRef = Math.max(MIN_SUPPORT_R, h._hullN >= 3 ? hullDistance(hull, h._hullN, gx / hn, gz / hn) : 0);
    h._com.x = com.x;
    h._com.y = com.y;
    h._com.z = com.z;

    this._untire(h);
    h.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
    this._readPose(h);
    h._prev.set(h._cur);
    h.state = 'frozen';
    h.settledAt = this._time;
    // Settling again after being woken (not freshly placed): physics has
    // just held this block up under the load it carries now.
    h._rest = h._woken;
    h._woken = false;
    h._asap = false;
    h._calm = 0;
    h._refused = 0;
    h._top = this._topOf(h);
    this._dirty = true;
    this._moversDirty = true;
    return true;
  }

  _untire(h) {
    if (!h._tired) return;
    h._tired = false;
    h.body.setLinearDamping(DAMP_LIN);
    h.body.setAngularDamping(DAMP_ANG);
  }

  // Undo a freeze from this same frame (quietly).
  _thaw(h) {
    h.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    h.body.setLinvel(this._zero, true);
    h.body.setAngvel(this._zero, true);
    h.state = 'free';
    h._calm = 0;
    this._dirty = true;
    this._moversDirty = true;
  }

  _topOf(h) {
    const c = h._cur;
    const qx = c[3];
    const qy = c[4];
    const qz = c[5];
    const qw = c[6];
    // second row of the rotation matrix
    const r0 = 2 * (qx * qy + qw * qz);
    const r1 = 1 - 2 * (qx * qx + qz * qz);
    const r2 = 2 * (qy * qz - qw * qx);
    const p = h._extent;
    let top = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const y = r0 * p[i] + r1 * p[i + 1] + r2 * p[i + 2];
      if (y > top) top = y;
    }
    return c[1] + top;
  }

  // Frozen blocks and everything they (transitively) hold up.
  _closureUp(seeds) {
    for (const h of this._blocks) h._carriers.length = 0;
    for (const h of this._blocks) {
      if (h.state !== 'frozen') continue;
      for (const s of h._sup) if (s.o.kind === 'block') s.o._carriers.push(h);
    }
    const out = new Set();
    const stack = [];
    for (const s of seeds) {
      if (s.state === 'frozen' && !out.has(s)) {
        out.add(s);
        stack.push(s);
      }
    }
    while (stack.length) {
      const h = stack.pop();
      for (const c of h._carriers) {
        if (c.state === 'frozen' && !out.has(c)) {
          out.add(c);
          stack.push(c);
        }
      }
    }
    return out;
  }

  _wakeUp(seeds, reason, noFreeze, quick = false) {
    const set = this._closureUp(seeds);
    if (set.size) this._unfreeze(set, reason, noFreeze, quick);
    return set;
  }

  // quick: they were woken at rest (no knock) and may freeze again early.
  _unfreeze(set, reason, noFreeze, quick = false) {
    let count = 0;
    for (const h of set) {
      if (h.state !== 'frozen') continue;
      h.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      // A body switched back to dynamic keeps whatever velocity it had.
      h.body.setLinvel(this._zero, true);
      h.body.setAngvel(this._zero, true);
      h.state = 'free';
      h._calm = 0;
      h._quick = quick;
      h._woken = true;
      h._freeSince = this._time;
      h._noFreezeUntil = this._time + noFreeze;
      h._sup.length = 0;
      h._deps.length = 0;
      if (reason !== 'topple') h._slack = 0;
      count++;
    }
    if (!count) return;
    // Free blocks asleep on the woken ones must notice their support moving.
    for (const h of this._blocks) if (h.state === 'free' && h.body.isSleeping()) h.body.wakeUp();
    this._dirty = true;
    this._moversDirty = true;
    this._emit('wake', { reason, count });
  }

  // The static balance check over all frozen blocks (see header).
  _analyse() {
    this._dirty = false;
    const list = [];
    let height = 0;
    for (const h of this._blocks) {
      if (h.state !== 'frozen') continue;
      h._ai = list.length;
      h._load = h.mass;
      h._mx = h.mass * h._com.x;
      h._mz = h.mass * h._com.z;
      h._pending = 0;
      list.push(h);
      if (h._top > height) height = h._top;
    }
    this._height = height;
    for (const h of list) {
      for (const s of h._sup) if (s.vertical && s.o.kind === 'block' && s.o.state === 'frozen') s.o._pending++;
    }
    const queue = list.filter((h) => h._pending === 0);
    const done = new Uint8Array(list.length);
    let weakest = null;
    let weakestV = 1;
    const failing = [];
    const gx = new Float64Array(W_MAX);
    const gz = new Float64Array(W_MAX);
    const sups = [];
    let processed = 0;
    while (processed < list.length) {
      let h = queue.pop();
      if (!h) {
        // A support cycle (blocks propping each other): break it at the
        // highest unprocessed block.
        for (const x of list) if (!done[x._ai] && (!h || x._com.y > h._com.y)) h = x;
      }
      if (done[h._ai]) continue;
      done[h._ai] = 1;
      processed++;
      const cx = h._mx / h._load;
      const cz = h._mz / h._load;
      let margin = hullDistance(h._hull, h._hullN, cx, cz);
      if (margin < -TOPPLE_TOL && h._slackPending) {
        // Physics already showed this load standing (see _checkVerify).
        h._slack = -margin + TOPPLE_TOL;
        h._slackPending = false;
      }
      if (margin !== Infinity) margin += h._slack;
      if (margin < -TOPPLE_TOL && h._rest && this._allRest(h)) {
        // This block and everything on it settled again after a knock or a
        // wake, so real physics just showed this load standing (often on a
        // tilted, edge-only contact the hull check reads too harshly).
        h._slack += -margin + TOPPLE_TOL;
        margin = TOPPLE_TOL;
      }
      if (margin < -TOPPLE_TOL) failing.push({ h, cx, cz, deficit: -margin });
      // A lone block leaning on something reads 0 by construction (its own
      // COM is the virtual support point); it is not about to topple.
      if (margin !== Infinity && !(h._virtual && h._load <= h.mass * 1.001)) {
        const v = Math.max(0, Math.min(1, margin / h._rRef));
        if (v < weakestV || (!weakest && v <= weakestV)) {
          weakestV = v;
          weakest = h;
        }
      }
      // Share the load among the supporters below.
      sups.length = 0;
      for (const s of h._sup) if (s.vertical && sups.length < W_MAX) sups.push(s);
      if (sups.length) {
        for (let i = 0; i < sups.length; i++) {
          gx[i] = sups[i].gx;
          gz[i] = sups[i].gz;
        }
        const w = wScratch;
        shareLoad(sups.length, gx, gz, cx, cz, w);
        let ax = 0;
        let az = 0;
        for (let i = 0; i < sups.length; i++) {
          ax += w[i] * gx[i];
          az += w[i] * gz[i];
        }
        // What the centroids can't reach sits off-centre on every contact.
        const dx = cx - ax;
        const dz = cz - az;
        for (let i = 0; i < sups.length; i++) {
          const o = sups[i].o;
          if (o.kind !== 'block' || o.state !== 'frozen' || w[i] <= 0) continue;
          const l = w[i] * h._load;
          o._load += l;
          o._mx += l * (gx[i] + dx);
          o._mz += l * (gz[i] + dz);
        }
      }
      for (const s of h._sup) {
        if (!s.vertical || s.o.kind !== 'block' || s.o.state !== 'frozen') continue;
        if (--s.o._pending === 0) queue.push(s.o);
      }
    }
    this._stab.value = list.length ? weakestV : 1;
    this._stab.weakest = weakest;
    if (!failing.length) return;
    // Topple from the lowest failure up: its fall carries the ones above.
    failing.sort((a, b) => a.h._com.y - b.h._com.y);
    for (const f of failing) if (f.h.state === 'frozen') this._topple(f);
    this._dirty = true;
  }

  _allRest(h) {
    for (const b of this._closureUp([h])) if (!b._rest) return false;
    return true;
  }

  _topple({ h, cx, cz }) {
    const near = this._near;
    hullNearest(h._hull, h._hullN, cx, cz, near);
    let dx = cx - near[0];
    let dz = cz - near[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    let pivotY = h._com.y;
    for (const s of h._sup) if (s.vertical && s.pts.length) pivotY = Math.min(pivotY, s.pts[1]);
    const set = this._closureUp([h]);
    this._unfreeze(set, 'topple', VERIFY_TIME);
    {
      // Start the tip over the support edge (gravity does the rest).
      const ax = dz * NUDGE_W;
      const az = -dx * NUDGE_W;
      for (const b of set) {
        const rx = b._cur[0] - near[0];
        const ry = b._cur[1] - pivotY;
        const rz = b._cur[2] - near[1];
        this._v.x = -az * ry;
        this._v.y = az * rx - ax * rz;
        this._v.z = ax * ry;
        this._w.x = ax;
        this._w.y = 0;
        this._w.z = az;
        b.body.setLinvel(this._v, true);
        b.body.setAngvel(this._w, true);
      }
    }
    this._verify.push({ h, until: this._time + VERIFY_TIME, x: h._cur[0], y: h._cur[1], z: h._cur[2], qx: h._cur[3], qy: h._cur[4], qz: h._cur[5], qw: h._cur[6] });
    this._emit('topple', { handle: h });
  }

  // After a topple: if the block has barely moved, physics says the load
  // stands after all (friction, a lean the contacts can't show), so accept
  // it next time instead of toppling it over and over.
  _checkVerify() {
    const t = this._time;
    for (let i = this._verify.length - 1; i >= 0; i--) {
      const v = this._verify[i];
      if (t < v.until) continue;
      this._verify.splice(i, 1);
      const h = v.h;
      if (h.state === 'removed' || h.state === 'held') continue;
      const c = h._cur;
      const move = Math.hypot(c[0] - v.x, c[1] - v.y, c[2] - v.z);
      const dot = Math.abs(c[3] * v.qx + c[4] * v.qy + c[5] * v.qz + c[6] * v.qw);
      const turn = 2 * Math.acos(Math.min(1, dot));
      if (move < VERIFY_MOVE && turn < VERIFY_TURN) h._slackPending = true;
    }
  }

  // ---- dragging, kinematic, impulses, waking ----------------------------------

  hold(h) {
    if (h.kind !== 'block' || h.state === 'held' || h.state === 'removed') return;
    if (h.state === 'frozen') {
      const up = this._closureUp([h]);
      up.delete(h);
      if (up.size) this._unfreeze(up, 'tool', 0);
      h.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      this._dirty = true;
    } else if (h.state === 'kinematic') {
      h.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    }
    this._untire(h);
    h.state = 'held';
    h._slack = 0;
    h._calm = 0;
    h._woken = false;
    h.body.setGravityScale(0, true);
    h.body.setLinearDamping(0);
    h.body.setAngularDamping(0);
    h.body.enableCcd(true);
    h.body.setLinvel(this._zero, true);
    h.body.setAngvel(this._zero, true);
    this._readPose(h);
    h._target.set(h._cur);
    this._held.push(h);
    this._moversDirty = true;
  }

  // Per frame while held: target pose (quaternion optional).
  drive(h, pos, quat) {
    if (h.state !== 'held') return;
    const t = h._target;
    t[0] = pos.x;
    t[1] = pos.y;
    t[2] = pos.z;
    if (quat) {
      t[3] = quat.x;
      t[4] = quat.y;
      t[5] = quat.z;
      t[6] = quat.w;
    }
  }

  _drive(h) {
    const c = h._cur;
    const t = h._target;
    let vx = (t[0] - c[0]) / HOLD_TAU;
    let vy = (t[1] - c[1]) / HOLD_TAU;
    let vz = (t[2] - c[2]) / HOLD_TAU;
    const vl = Math.hypot(vx, vy, vz);
    if (vl > HOLD_VMAX) {
      const k = HOLD_VMAX / vl;
      vx *= k;
      vy *= k;
      vz *= k;
    }
    // rotation error q_err = q_target * conj(q_current)
    const ax = t[3];
    const ay = t[4];
    const az = t[5];
    const aw = t[6];
    const bx = -c[3];
    const by = -c[4];
    const bz = -c[5];
    const bw = c[6];
    let ex = aw * bx + ax * bw + ay * bz - az * by;
    let ey = aw * by - ax * bz + ay * bw + az * bx;
    let ez = aw * bz + ax * by - ay * bx + az * bw;
    let ew = aw * bw - ax * bx - ay * by - az * bz;
    if (ew < 0) {
      ex = -ex;
      ey = -ey;
      ez = -ez;
      ew = -ew;
    }
    const s = Math.hypot(ex, ey, ez);
    let wx = 0;
    let wy = 0;
    let wz = 0;
    if (s > 1e-9) {
      const angle = 2 * Math.atan2(s, ew);
      let k = angle / HOLD_TAU_ROT / s;
      if (angle / HOLD_TAU_ROT > HOLD_WMAX) k = HOLD_WMAX / s;
      wx = ex * k;
      wy = ey * k;
      wz = ez * k;
    }
    this._v.x = vx;
    this._v.y = vy;
    this._v.z = vz;
    this._w.x = wx;
    this._w.y = wy;
    this._w.z = wz;
    h.body.setLinvel(this._v, true);
    h.body.setAngvel(this._w, true);
  }

  release(h, velocity) {
    if (h.state !== 'held') return;
    const i = this._held.indexOf(h);
    if (i >= 0) this._held.splice(i, 1);
    h.state = 'free';
    h._calm = 0;
    h._quick = false;
    h._woken = false; // placed by the player: checked like a new block
    h._freeSince = this._time;
    h.body.setGravityScale(1, true);
    h.body.setLinearDamping(DAMP_LIN);
    h.body.setAngularDamping(DAMP_ANG);
    h.body.enableCcd(false);
    const v = velocity ? { x: velocity.x, y: velocity.y, z: velocity.z } : h.body.linvel();
    const l = Math.hypot(v.x, v.y, v.z);
    if (l > RELEASE_VMAX) {
      v.x *= RELEASE_VMAX / l;
      v.y *= RELEASE_VMAX / l;
      v.z *= RELEASE_VMAX / l;
    }
    h.body.setLinvel(v, true);
    const w = h.body.angvel();
    w.x *= 0.3;
    w.y *= 0.3;
    w.z *= 0.3;
    h.body.setAngvel(w, true);
    this._moversDirty = true;
  }

  setKinematic(h, on) {
    if (h.state === 'removed') return;
    if (on) {
      if (h.state === 'kinematic') return;
      if (h.state === 'held') this.release(h);
      if (h.state === 'frozen') {
        const up = this._closureUp([h]);
        up.delete(h);
        if (up.size) this._unfreeze(up, 'tool', 0);
      }
      this._untire(h);
      h.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      h.state = 'kinematic';
    } else {
      if (h.state !== 'kinematic') return;
      h.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      h.body.setLinvel(this._zero, true);
      h.body.setAngvel(this._zero, true);
      h.state = 'free';
      h._calm = 0;
      h._freeSince = this._time;
    }
    this._dirty = true;
    this._moversDirty = true;
  }

  setKinematicPose(h, pos, quat) {
    if (h.state !== 'kinematic') return;
    if (pos) h.body.setNextKinematicTranslation(pos);
    if (quat) h.body.setNextKinematicRotation(quat);
  }

  // A flick: wakes the block (and whatever it holds up) and kicks it.
  impulse(h, imp, point) {
    if (h.state === 'removed') return;
    if (h.state === 'frozen') this._wakeUp([h], 'tool', KNOCK_NO_FREEZE);
    if (h.state === 'kinematic' || h.state === 'fixed') return;
    h._calm = 0;
    h._quick = false;
    if (h.kind === 'block') {
      this._untire(h);
      h._freeSince = this._time;
    }
    if (point) h.body.applyImpulseAtPoint(imp, point, true);
    else h.body.applyImpulse(imp, true);
  }

  // Unfreeze blocks (default: all) and everything resting on them.
  // opts.reason ('tool' | 'manual' | ...), opts.hold: seconds they stay
  // dynamic before they may freeze again.
  wake(handles, opts = {}) {
    const seeds = handles ? handles.filter((h) => h.kind === 'block') : this._blocks;
    return this._wakeUp(seeds, opts.reason || 'tool', opts.hold || 0, true).size;
  }

  wakeAll(opts = {}) {
    return this.wake(null, opts);
  }

  // Debug/test: freeze every free block where it is now.
  freezeAll() {
    const list = this._blocks.filter((h) => h.state === 'free');
    for (const h of list) this._readSupports(h);
    list.sort((a, b) => a._cur[1] - b._cur[1]);
    for (const h of list) {
      h._lateral = true; // accept the pose as it is
      if (this._freeze(h)) this._emit('settle', { handle: h });
    }
    this._analyse();
  }

  // ---- queries ------------------------------------------------------------------

  // Closest hit along a ray against blocks and the floor (walls and tool
  // bodies are ignored). opts.exclude: a handle to skip; opts.solidOnly:
  // skip held and kinematic blocks.
  raycast(origin, dir, maxToi = 10, opts = {}) {
    const r = this._ray;
    r.origin.x = origin.x;
    r.origin.y = origin.y;
    r.origin.z = origin.z;
    r.dir.x = dir.x;
    r.dir.y = dir.y;
    r.dir.z = dir.z;
    this._rayExclude = opts.exclude || null;
    this._rayAll = !opts.solidOnly;
    const hit = this.world.castRayAndGetNormal(r, maxToi, true, undefined, undefined, undefined, undefined, this._rayFilter);
    this._rayExclude = null;
    this._rayAll = true;
    if (!hit) return null;
    const o = this._owners.get(hit.collider.handle);
    const d = hit.timeOfImpact;
    return {
      handle: o && o.kind === 'block' ? o : null,
      point: { x: origin.x + dir.x * d, y: origin.y + dir.y * d, z: origin.z + dir.z * d },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      distance: d,
    };
  }

  // Highest block surface (or the floor, 0) straight below (x, z). With a
  // radius it also probes four points around, for a block's footprint.
  topAt(x, z, radius = 0, exclude = null) {
    let top = 0;
    const probe = (px, pz) => {
      const hit = this.raycast({ x: px, y: 3, z: pz }, { x: 0, y: -1, z: 0 }, 4, { exclude, solidOnly: true });
      if (hit && hit.point.y > top) top = hit.point.y;
    };
    probe(x, z);
    if (radius > 0) {
      probe(x + radius, z);
      probe(x - radius, z);
      probe(x, z + radius);
      probe(x, z - radius);
    }
    return top;
  }

  // Top of the tallest frozen structure (every frozen block stands on the
  // floor through its supports).
  structureHeight() {
    if (this._dirty) this._analyse();
    return this._height;
  }

  // { value: 0..1 (1 = rock solid, 0 = about to topple), weakest: handle }.
  // The same object is returned every time.
  stability() {
    if (this._dirty) this._analyse();
    return this._stab;
  }

  // Does any other block rest on this one? (For "only lift the top ones".)
  // Frozen blocks keep their supports; Rapier has no contacts between two
  // fixed bodies, so those come from the record and the rest from the live
  // contacts.
  carrying(h) {
    if (!h || h.kind !== 'block' || h.state === 'removed') return false;
    for (const b of this._blocks) {
      if (b === h || b.state !== 'frozen') continue;
      for (const s of b._sup) if (s.o === h && s.vertical) return true;
    }
    const np = this.world.narrowPhase;
    const others = this._pairTmp;
    let found = false;
    for (const col of h.colliders) {
      others.length = 0;
      np.contactPairsWith(col.handle, (oh) => others.push(oh));
      for (const oh of others) {
        const o = this._owners.get(oh);
        if (!o || o === h || o.kind !== 'block' || o.state === 'frozen') continue;
        np.contactPair(col.handle, oh, this.world.bodies, (m, flipped) => {
          if (!m.numSolverContacts()) return;
          const ny = m.normal(this._n).y;
          if ((flipped ? -ny : ny) > 0.5) found = true; // from h up into o
        });
        if (found) return true;
      }
    }
    return false;
  }

  // Nothing moving: every block frozen or asleep, nothing held, tool
  // bodies asleep.
  quiet() {
    for (const h of this._blocks) {
      if (h.state === 'held') return false;
      if (h.state === 'free' && !h.body.isSleeping()) return false;
    }
    for (const h of this._bodies) if (h.state === 'free' && !h.body.isSleeping()) return false;
    return true;
  }

  get blocks() {
    return this._blocks;
  }

  get bodies() {
    return this._bodies;
  }

  get time() {
    return this._time;
  }

  // ---- events -----------------------------------------------------------------

  on(name, fn) {
    (this._listeners[name] ||= []).push(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    const l = this._listeners[name];
    if (!l) return;
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }

  // Events raised inside step() are delivered at its end, so listeners may
  // add, remove or wake bodies safely.
  _emit(name, payload) {
    this._out.push(name, payload);
    if (!this._inStep) this._dispatch();
  }

  _dispatch() {
    if (!this._out.length) return;
    const out = this._out;
    this._out = [];
    for (let i = 0; i < out.length; i += 2) {
      const l = this._listeners[out[i]];
      if (l) for (const fn of l.slice()) fn(out[i + 1]);
    }
  }

  // ---- internals ------------------------------------------------------------

  _makeHandle(kind, shapeId, material, opts, specs) {
    return {
      id: this._nextId++,
      kind,
      shapeId,
      state: 'free',
      body: null,
      userData: opts.userData ?? null,
      settledAt: 0,
      material,
      mass: 0,
      colliders: [],
      _prev: new Float64Array(7),
      _cur: new Float64Array(7),
      _target: new Float64Array(7),
      _extent: extentPoints(specs),
      _calm: 0,
      _refused: 0,
      _freeSince: this._time,
      _tired: false,
      _asap: false,
      _quick: false,
      _woken: false,
      _rest: false,
      _push: 0,
      _pushT: 0,
      _noFreezeUntil: 0,
      _supAt: -1,
      _sup: [],
      _deps: [],
      _lateral: false,
      _cand: false,
      _virtual: false,
      _hull: [],
      _hullN: 0,
      _rRef: MIN_SUPPORT_R,
      _com: { x: 0, y: 0, z: 0 },
      _top: 0,
      _slack: 0,
      _slackPending: false,
      _last: -1,
      _e: 0.25,
      _carriers: [],
      _ai: -1,
      _load: 0,
      _mx: 0,
      _mz: 0,
      _pending: 0,
    };
  }

  _createBody(type, o, linDamp, angDamp, gravityScale, ccd) {
    const B = RAPIER.RigidBodyDesc;
    const d = type === 'fixed' ? B.fixed() : type === 'kinematic' ? B.kinematicPositionBased() : B.dynamic();
    const p = o.position || { x: 0, y: 0, z: 0 };
    d.setTranslation(p.x, p.y, p.z);
    if (o.quaternion) d.setRotation({ x: o.quaternion.x, y: o.quaternion.y, z: o.quaternion.z, w: o.quaternion.w });
    if (o.velocity) d.setLinvel(o.velocity.x, o.velocity.y, o.velocity.z);
    if (o.angularVelocity) d.setAngvel({ x: o.angularVelocity.x, y: o.angularVelocity.y, z: o.angularVelocity.z });
    d.setLinearDamping(linDamp).setAngularDamping(angDamp).setGravityScale(gravityScale).setCcdEnabled(ccd);
    return this.world.createRigidBody(d);
  }
}
