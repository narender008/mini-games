// Canal Town's plan: the water, the land and where things stand. Two canal
// rings (a wide outer one and a narrower inner one) curve round the old town
// like Amsterdam's grachten and open at both ends into the harbour basin, a
// short cross canal joins the rings in the north, and a breakwater with a
// lighthouse closes the basin off from the sea. Everything is one signed
// distance to the water (negative on the water), so the heights, the solid
// map for the boat, the quay walls and the rows of houses all follow the
// same smooth lines.
import { clamp, smoothstep } from '../config.js';
import { makeNoise } from './common.js';

const noise = makeNoise(57);

export const CZ = 40; // the harbour front: the rings are centred on (0, CZ)
export const OUTER = { r: 250, hw: 27 }; // centre-line radius and half width
export const INNER = { r: 132, hw: 16 };
export const RADIAL = { hw: 14, z0: CZ - INNER.r, z1: CZ - OUTER.r };
export const BASIN = { x0: -340, x1: 340, z0: CZ, z1: 250, round: 30 };
export const MOUTH = { x0: 40, x1: 110 }; // the gap in the breakwater (closed by a floating boom)
export const COAST = 380; // |x| beyond which the land runs south past the breakwater
export const STREET = 1.35; // street level; the quay copings stand a little higher
export const QUAY_TOP = 1.45;
export const BED = -2.7; // canal bed next to the walls

const deg = Math.PI / 180;

// Bridges: where they cross (canal, angle round the ring), how far the canal
// narrows under them (half width) and what kind they are.
export const BRIDGES = [
  { id: 'stoneW', ring: 'outer', a: -40 * deg, hw: 15.5, kind: 'stone', width: 7 },
  { id: 'stoneE', ring: 'outer', a: 40 * deg, hw: 15.5, kind: 'stone', width: 7, seed: 2 },
  { id: 'wood', ring: 'inner', a: -62 * deg, hw: 14, kind: 'wood', width: 4.2 },
  { id: 'houses', ring: 'radial', z: CZ - (INNER.r + INNER.hw + OUTER.r - OUTER.hw) / 2, hw: RADIAL.hw, kind: 'houses', width: 9 },
];

const PINCH = 0.1; // radians: how gently a canal narrows towards a bridge

function halfWidth(ring, a) {
  let hw = ring.hw;
  for (const b of BRIDGES) {
    if (b.ring === 'radial' || (b.ring === 'outer') !== (ring === OUTER)) continue;
    const t = (a - b.a) / PINCH;
    hw -= (ring.hw - b.hw) * Math.exp(-0.5 * t * t);
  }
  return hw;
}

// angle round the rings: 0 = due north of (0, CZ), +90 degrees = east
export const ringAngle = (x, z) => Math.atan2(x, CZ - z);
export const ringPoint = (r, a) => ({ x: Math.sin(a) * r, z: CZ - Math.cos(a) * r });

function ringD(x, z, ring) {
  const dz = z - CZ;
  const r = Math.hypot(x, dz);
  const a = Math.atan2(x, -dz);
  const d = Math.abs(r - ring.r) - halfWidth(ring, a);
  return Math.max(d, dz - 30); // the northern half only (its ends run into the basin)
}

function boxD(x, z, x0, x1, z0, z1, rr) {
  const hx = (x1 - x0) / 2 - rr;
  const hz = (z1 - z0) / 2 - rr;
  const qx = Math.abs(x - (x0 + x1) / 2) - hx;
  const qz = Math.abs(z - (z0 + z1) / 2) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rr;
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Signed distance (roughly metres) to the drivable water: negative on the
// canals and in the basin, positive on land.
export function waterD(x, z) {
  let d = boxD(x, z, BASIN.x0, BASIN.x1, BASIN.z0, BASIN.z1, BASIN.round);
  if (z < CZ + 40) {
    d = smin(d, ringD(x, z, OUTER), 16);
    d = smin(d, ringD(x, z, INNER), 14);
    if (Math.abs(x) < 60 && z < RADIAL.z0 + 20 && z > RADIAL.z1 - 20) d = smin(d, Math.abs(x) - RADIAL.hw, 12);
  }
  return d;
}

// The sea beyond the breakwater (and in the harbour mouth), negative on it.
export const SEA_Z = 268; // the sea side of the breakwater
export function seaD(x, z) {
  const open = Math.max(SEA_Z - z, Math.abs(x) - COAST);
  const gap = boxD(x, z, MOUTH.x0, MOUTH.x1, BASIN.z1 - 20, SEA_Z + 40, 6);
  return Math.min(open, gap);
}

// Any water at all (land meets water where this is zero).
export function allWaterD(x, z, w = waterD(x, z)) {
  return z > 230 ? smin(w, seaD(x, z), 8) : w;
}

// ------------------------------------------------------------ moored boats

// kind: 'row' (rowing boat), 'sloep' (open launch), 'barge' (a canal boat
// with a cabin). Each lies alongside a quay with fenders out.
export const BOAT_SIZE = {
  row: { L: 4.3, B: 1.55 },
  sloep: { L: 6.6, B: 2.2 },
  barge: { L: 15, B: 3.6 },
};

function moorRing(ring, bank, adeg, kind, colour, flip = false) {
  const a = adeg * deg;
  const s = BOAT_SIZE[kind];
  const hw = halfWidth(ring, a);
  const r = ring.r + bank * (hw - 0.55 - s.B / 2);
  const p = ringPoint(r, a);
  // lying along the canal (tangent), bow either way
  return { kind, colour, x: p.x, z: p.z, heading: -a + (flip ? Math.PI : 0) - Math.PI / 2, seed: Math.round(adeg * 7) };
}

function moorFront(x, kind, colour, flip = false) {
  const s = BOAT_SIZE[kind];
  return { kind, colour, x, z: CZ + 0.55 + s.B / 2, heading: flip ? Math.PI / 2 : -Math.PI / 2, seed: Math.round(x) };
}

function moorSide(side, z, kind, colour, flip = false) {
  const s = BOAT_SIZE[kind];
  const x = side < 0 ? BASIN.x0 + 0.55 + s.B / 2 : BASIN.x1 - 0.55 - s.B / 2;
  return { kind, colour, x, z, heading: flip ? Math.PI : 0, seed: Math.round(z) + side };
}

export const MOORED = [
  // the harbour front
  moorFront(-92, 'barge', '#2d4a3e'),
  moorFront(-62, 'sloep', '#f2eee4'),
  moorFront(-50, 'row', '#3f78a8', true),
  moorFront(34, 'row', '#c8463a'),
  moorFront(48, 'sloep', '#1f3550', true),
  moorFront(84, 'barge', '#6b2a24', true),
  moorFront(-310, 'sloep', '#e9dfc9'),
  moorFront(300, 'row', '#e8b83c', true),
  // the inner ring
  moorRing(INNER, 1, -38, 'row', '#e2d6b8'),
  moorRing(INNER, 1, -31, 'row', '#2f6e8e', true),
  moorRing(INNER, -1, 22, 'sloep', '#8a2f2a'),
  moorRing(INNER, 1, 58, 'barge', '#23364a', true),
  // the outer ring
  moorRing(OUTER, 1, -62, 'barge', '#3a4a2a'),
  moorRing(OUTER, 1, -5, 'sloep', '#f0ece2', true),
  moorRing(OUTER, -1, 8, 'row', '#d06a2c'),
  moorRing(OUTER, 1, 66, 'sloep', '#33506b'),
  moorRing(OUTER, -1, -70, 'row', '#e8e2d2', true),
  // by the basin's side quays
  moorSide(-1, 150, 'barge', '#28323c'),
  moorSide(1, 110, 'sloep', '#b83a30', true),
];

for (const b of MOORED) {
  const s = BOAT_SIZE[b.kind];
  b.L = s.L;
  b.B = s.B;
  b.fx = -Math.sin(b.heading);
  b.fz = -Math.cos(b.heading);
}

function inMoored(x, z, pad) {
  for (const b of MOORED) {
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) > 12 && Math.abs(dz) > 12) continue;
    const along = dx * b.fx + dz * b.fz;
    const across = dx * -b.fz + dz * b.fx;
    if (Math.abs(along) < b.L / 2 + pad && Math.abs(across) < b.B / 2 + pad) return true;
  }
  return false;
}

// ------------------------------------------------------------ heights

export function height(x, z) {
  const w = waterD(x, z);
  const s = z > 230 ? seaD(x, z) : 1e9;
  const f = allWaterD(x, z, w);
  const n = noise.noise(x * 0.05, z * 0.05);
  let bed;
  if (w <= s) {
    // canal and basin floors: a few metres of murky water, deeper out in the basin
    const inBasin = smoothstep(CZ - 10, CZ + 40, z);
    bed = BED - 0.25 + n * 0.25 - inBasin * smoothstep(0, 60, -w) * 2.2;
  } else {
    // the sea bed falls away beyond the breakwater
    bed = -3 - smoothstep(0, 60, -s) * 12 + n * 0.4;
  }
  if (f < 0) return Math.max(-16, Math.min(bed, BED + Math.max(f, -16) * 0.06));
  // land: rises inside the quay wall's thickness to street level; towards
  // the sea a rubble slope instead
  if (s < w) return f < 7 ? bed + (STREET - bed) * smoothstep(0, 7, f) : STREET;
  if (f < 2) return bed + (STREET - bed) * smoothstep(0.2, 1.8, f);
  return STREET;
}

export function solid(x, z) {
  if (waterD(x, z) > -0.35) return true;
  return inMoored(x, z, 0.35);
}

// ------------------------------------------------------------ bridges

// Where each bridge stands: its centre on the water, the unit direction of
// its deck (across the canal), the free span between the quay faces and the
// canal direction (along the water).
export function bridgeFrame(b) {
  if (b.ring === 'radial') {
    return { x: 0, z: b.z, ax: 1, az: 0, span: b.hw * 2, tx: 0, tz: -1 };
  }
  const ring = b.ring === 'outer' ? OUTER : INNER;
  const p = ringPoint(ring.r, b.a);
  const ax = Math.sin(b.a);
  const az = -Math.cos(b.a);
  return { x: p.x, z: p.z, ax, az, span: halfWidth(ring, b.a) * 2, tx: Math.cos(b.a), tz: Math.sin(b.a) };
}

// is (x, z) on a bridge's footprint on land (its abutments and stairs), so
// houses and trees keep clear? pad widens it.
export function nearBridge(x, z, pad = 0) {
  for (const b of BRIDGES) {
    const f = b.frame || (b.frame = bridgeFrame(b));
    const dx = x - f.x;
    const dz = z - f.z;
    const across = dx * f.ax + dz * f.az;
    const along = dx * f.tx + dz * f.tz;
    const reach = f.span / 2 + (b.kind === 'houses' ? 14 : 24);
    if (Math.abs(across) < reach + pad && Math.abs(along) < b.width / 2 + 2.5 + pad) return true;
  }
  return false;
}

export { clamp };
