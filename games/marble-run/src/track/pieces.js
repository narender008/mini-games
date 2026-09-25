// The catalogue of marble-run pieces. Every level builds from the same
// pieces (each level's skin dresses them in its own materials), so a ready-
// made run can be opened in the free-build sandbox and edited.
//
// A piece sits on the build grid: 5 cm cells, 1 cm height steps. It is
// described in its own frame, with the marble arriving from the west (-x)
// and local cell (0, 0) centred on the origin; placing it rotates it in
// quarter turns and moves it to a cell and a height. Its ports sit in the
// middle of a cell face at a height step, and every lane leaves and meets a
// port at the same gentle downhill slope, so a marble rolls from one piece
// to the next without a bump. Pieces also say which cells they fill (for
// snapping, supports and overlap tests) and carry their mechanisms: bells,
// wheels, spinners, splitters, funnels and lifts.
import * as THREE from 'three';
import { CELL, LEVEL, PORT_Y, PORT_SLOPE, R_MARBLE } from '../config.js';
import { CurveBuilder } from './path.js';

const H = CELL / 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const portY = (dl) => dl * LEVEL + PORT_Y;

// Face directions in the piece's own frame: E is the way marbles travel.
export const FACES = {
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
  N: [0, -1],
};

// ------------------------------------------------------------ 2D paths

// A flat path in the piece's xz plane from lines and arcs, evaluated by
// arc length so the height profile can be laid along it evenly.
class Path2 {
  constructor() {
    this.parts = [];
    this.length = 0;
  }

  line(x0, z0, x1, z1) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    this.parts.push({ L, at: (t) => [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t] });
    this.length += L;
    return this;
  }

  // centre (cx, cz), radius r, from angle a0 to a1 (radians, x = cos, z = sin)
  arc(cx, cz, r, a0, a1) {
    const L = Math.abs(a1 - a0) * r;
    this.parts.push({ L, at: (t) => [cx + r * Math.cos(a0 + (a1 - a0) * t), cz + r * Math.sin(a0 + (a1 - a0) * t)] });
    this.length += L;
    return this;
  }

  // a smooth S from (x0, z0) to (x1, z1), both ends heading +x
  ess(x0, z0, x1, z1, steps = 32) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const s = t * t * (3 - 2 * t);
      pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * s]);
    }
    return this.poly(pts);
  }

  poly(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    this.parts.push({
      L,
      at: (t) => {
        const s = t * L;
        let j = 0;
        while (j < pts.length - 2 && cum[j + 1] < s) j++;
        const k = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
        return [pts[j][0] + (pts[j + 1][0] - pts[j][0]) * k, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * k];
      },
    });
    this.length += L;
    return this;
  }

  at(u) {
    let s = u * this.length;
    for (const p of this.parts) {
      if (s <= p.L || p === this.parts[this.parts.length - 1]) return p.at(p.L ? Math.min(1, s / p.L) : 0);
      s -= p.L;
    }
    return [0, 0];
  }
}

// A lane that follows a flat path while falling from y0 to y1, leaving and
// arriving at the given slopes (the standard join slope by default).
function flatLane(path, y0, y1, s0 = PORT_SLOPE, s1 = PORT_SLOPE, steps = 96) {
  const L = path.length;
  const prof = hermite(y0, y1, L, s0, s1);
  return new CurveBuilder().add((u) => {
    const [x, z] = path.at(u);
    return V(x, prof(u), z);
  }, null, steps);
}

// Cubic height profile over a run of length L with end slopes s0, s1
// (positive = downhill).
function hermite(y0, y1, L, s0, s1) {
  const m0 = -s0 * L;
  const m1 = -s1 * L;
  return (t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
  };
}

// ------------------------------------------------------------ the pieces

// Each definition:
//   cells: footprint in local cells; ports: { name: { cell, face, dl, dir } }
//   (dir 'in' or 'out'); lanes(p): the lanes in local coordinates, as
//   { name, curve, channel, surface?, ... }; links: internal lane joins;
//   portLane: which lane end each port belongs to; mech: mechanisms.
// p is the placement's options (for variable pieces such as lifts).

function straightDef(id, len, drop, extra = {}) {
  return {
    id,
    cells: Array.from({ length: len }, (_, a) => [a, 0]),
    ports: { in: { cell: [0, 0], face: 'W', dl: drop, dir: 'in' }, out: { cell: [len - 1, 0], face: 'E', dl: 0, dir: 'out' } },
    lanes() {
      const path = new Path2().line(-H, 0, (len - 1) * CELL + H, 0);
      return [{ name: 'main', curve: flatLane(path, portY(drop), portY(0)), channel: extra.channel || 'trough', surface: extra.surface }];
    },
    portLane: { in: ['main', 'start'], out: ['main', 'end'] },
    ...extra,
  };
}

function curveDef(id, dir) {
  // dir -1 turns left (to N), +1 turns right (to S)
  const face = dir < 0 ? 'N' : 'S';
  return {
    id,
    cells: [[0, 0]],
    ports: { in: { cell: [0, 0], face: 'W', dl: 1, dir: 'in' }, out: { cell: [0, 0], face, dl: 0, dir: 'out' } },
    lanes() {
      const path = new Path2().arc(-H, dir * H, H, -dir * Math.PI / 2, 0);
      return [{ name: 'main', curve: flatLane(path, portY(1), portY(0)), channel: 'deep' }];
    },
    portLane: { in: ['main', 'start'], out: ['main', 'end'] },
  };
}

function bendDef(id, dir) {
  // a wide quarter turn, radius 1.5 cells
  const R = 3 * H;
  const face = dir < 0 ? 'N' : 'S';
  return {
    id,
    cells: [[0, 0], [1, 0], [1, dir]],
    ports: { in: { cell: [0, 0], face: 'W', dl: 2, dir: 'in' }, out: { cell: [1, dir], face, dl: 0, dir: 'out' } },
    lanes() {
      const path = new Path2().arc(-H, dir * R, R, -dir * Math.PI / 2, 0);
      return [{ name: 'main', curve: flatLane(path, portY(2), portY(0)), channel: 'trough' }];
    },
    portLane: { in: ['main', 'start'], out: ['main', 'end'] },
  };
}

function uturnDef(id, dir) {
  // turns back on itself into the next row: dir +1 towards S, -1 towards N
  return {
    id,
    cells: [[0, 0], [0, dir]],
    ports: { in: { cell: [0, 0], face: 'W', dl: 2, dir: 'in' }, out: { cell: [0, dir], face: 'W', dl: 0, dir: 'out' } },
    lanes() {
      const path = new Path2()
        .line(-H, 0, 0, 0)
        .arc(0, dir * H, H, -dir * Math.PI / 2, dir * Math.PI / 2)
        .line(0, dir * CELL, -H, dir * CELL);
      return [{ name: 'main', curve: flatLane(path, portY(2), portY(0)), channel: 'guard' }];
    },
    portLane: { in: ['main', 'start'], out: ['main', 'end'] },
  };
}

// A vertical drop inside a block: in at the top on the west face, a fall
// down a bore, out at the bottom on the east face.
function dropDef(id, drop) {
  return {
    id,
    cells: [[0, 0]],
    ports: { in: { cell: [0, 0], face: 'W', dl: drop, dir: 'in' }, out: { cell: [0, 0], face: 'E', dl: 0, dir: 'out' } },
    lanes() {
      const y0 = portY(drop);
      const y1 = portY(0);
      const r = 0.012; // elbow radius
      const xa = -0.006;
      const c = new CurveBuilder();
      const ya = y0 - PORT_SLOPE * (xa - -H);
      c.add((u) => V(-H + (xa + H) * u, y0 + (ya - y0) * u, 0), null, 8);
      // top elbow: heading +x, turning down
      c.add((u) => {
        const a = (u * Math.PI) / 2;
        return V(xa + r * Math.sin(a), ya - r * (1 - Math.cos(a)), 0);
      }, null, 24);
      const xb = xa + r;
      const yTop = ya - r;
      const yBot = y1 + r + PORT_SLOPE * (H - (xb + r));
      c.add((u) => V(xb, yTop + (yBot - yTop) * u, 0), null, 24);
      // bottom elbow: heading down, turning +x
      c.add((u) => {
        const a = (u * Math.PI) / 2;
        return V(xb + r * (1 - Math.cos(a)), yBot - r * Math.sin(a), 0);
      }, null, 24);
      const xc = xb + r;
      const yc = yBot - r;
      c.add((u) => V(xc + (H - xc) * u, yc + (y1 - yc) * u, 0), null, 8);
      return [{ name: 'main', curve: c, channel: 'tube', rmf: true, surface: 'wood' }];
    },
    portLane: { in: ['main', 'start'], out: ['main', 'end'] },
  };
}

// A spiral bowl funnel over a 2 x 2 (or 3 x 3) footprint. The marble comes
// in along a short lane that meets the rim tangentially, circles the bowl
// faster and faster, drops through the hole into a short bore and leaves
// on the east face at the bottom.
function funnelDef(id, size) {
  const n = size; // cells across
  const R = size === 2 ? 0.041 : 0.063; // marble-centre radius at the rim
  const depth = size === 2 ? 0.034 : 0.05;
  const rimDl = size === 2 ? 8 : 11;
  const cells = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) cells.push([a, b]);
  const cx = ((n - 1) * CELL) / 2;
  const cz = ((n - 1) * CELL) / 2;
  return {
    id,
    cells,
    ports: {
      in: { cell: [0, n - 1], face: 'W', dl: rimDl + 1, dir: 'in' },
      out: { cell: [n - 1, 0], face: 'E', dl: 0, dir: 'out' },
    },
    bowl: { cx, cz, R, depth, rimDl, hole: 0.0085 },
    support: 'centre',
    lanes() {
      const y0 = portY(rimDl + 1);
      const yRim = portY(rimDl);
      // in: from the west port on the back-most... front row, to the rim's
      // tangent point on the south side, heading +x
      const zIn = (n - 1) * CELL;
      const xT = cx;
      const zT = cz + R;
      const path = new Path2().ess(-H, zIn, xT, zT);
      const inLane = flatLane(path, y0, yRim, PORT_SLOPE, 0.02);
      // out: from under the hole, straight down, elbow to +x, S-bend to the port
      const yHole = yRim - depth;
      const y1 = portY(0);
      const r = 0.012;
      const xe = (n - 1) * CELL + H;
      const out = new CurveBuilder();
      const yElbow = y1 + r + 0.012;
      out.add((u) => V(cx, yHole + 0.004 + (yElbow - yHole - 0.004) * u, cz), (u) => V(1, 0, 0), 16);
      out.add((u) => {
        const a = (u * Math.PI) / 2;
        return V(cx + r * (1 - Math.cos(a)), yElbow - r * Math.sin(a), cz);
      }, null, 24);
      const x0 = cx + r;
      const yb = yElbow - r;
      const prof = hermite(yb, y1, xe - x0, 0.02, PORT_SLOPE);
      out.add((u) => {
        const s = u * u * (3 - 2 * u);
        return V(x0 + (xe - x0) * u, prof(u), cz + (0 - cz) * s);
      }, null, 48);
      return [
        { name: 'in', curve: inLane, channel: 'deep', intoBowl: true },
        { name: 'out', curve: out, channel: 'tube', rmf: true, up0: V(1, 0, 0) },
      ];
    },
    portLane: { in: ['in', 'start'], out: ['out', 'end'] },
  };
}

// A loop-the-loop: a steep run down, once round a vertical loop (sliding
// one row sideways so the way out clears the way in) and out along the
// next row.
function loopDef(id, radius, dropDl, len) {
  const cells = [];
  for (let a = 0; a < len; a++) cells.push([a, 0], [a, 1]);
  return {
    id,
    cells,
    tall: 2 * radius + 0.03,
    ports: { in: { cell: [0, 0], face: 'W', dl: dropDl, dir: 'in' }, out: { cell: [len - 1, 1], face: 'E', dl: 0, dir: 'out' } },
    loop: { radius },
    lanes() {
      const xe = (len - 1) * CELL + H;
      const xb = xe - 0.055 - radius * 0.2; // loop bottom
      const y1 = portY(0);
      const yb = y1 + PORT_SLOPE * (xe - xb) * 0.9;
      const y0 = portY(dropDl);
      const c = new CurveBuilder();
      const pin = hermite(y0, yb, xb + H, PORT_SLOPE, 0);
      c.add((u) => V(-H + (xb + H) * u, pin(u), 0), null, 64);
      const zAt = (a) => {
        const t = a / (2 * Math.PI);
        return CELL * t * t * (3 - 2 * t);
      };
      c.add(
        (u) => {
          const a = u * 2 * Math.PI;
          return V(xb + radius * Math.sin(a), yb + radius * (1 - Math.cos(a)), zAt(a));
        },
        (u) => {
          const a = u * 2 * Math.PI;
          return V(-Math.sin(a), Math.cos(a), 0);
        },
        160,
      );
      const pout = hermite(yb, y1, xe - xb, 0, PORT_SLOPE);
      c.add((u) => V(xb + (xe - xb) * u, pout(u), CELL), null, 48);
      return [{ name: 'main', curve: c, channel: 'guard', loopAt: { x: xb, r: radius } }];
    },
    portLane: { in: ['main', 'start'], out: ['main', 'end'] },
  };
}

// A water wheel: the marble drops onto the top of the wheel, rides a paddle
// round the front half and rolls out underneath, back the way it came.
function wheelDef(id) {
  const Rw = 0.038;
  const xw = 0.036;
  const inDl = 10;
  return {
    id,
    cells: [[0, 0], [1, 0]],
    ports: { in: { cell: [0, 0], face: 'W', dl: inDl, dir: 'in' }, out: { cell: [0, 0], face: 'W', dl: 0, dir: 'out', offset: -0.0 } },
    wheel: { x: xw, radius: Rw },
    lanes() {
      const y1 = portY(0);
      const yBot = y1 + PORT_SLOPE * (xw + H) * 0.9;
      const yw = yBot + Rw;
      const yTop = yw + Rw;
      const y0 = portY(inDl);
      const zIn = -0.0; // entry and exit share the row, one above the other
      const inC = new CurveBuilder();
      const pin = hermite(y0, yTop, xw + H, PORT_SLOPE, 0);
      inC.add((u) => V(-H + (xw + H) * u, pin(u), zIn), null, 48);
      const ride = new CurveBuilder();
      ride.add(
        (u) => {
          const a = Math.PI / 2 - u * Math.PI;
          return V(xw + Rw * Math.cos(a), yw + Rw * Math.sin(a), 0);
        },
        (u) => {
          const a = Math.PI / 2 - u * Math.PI;
          return V(-Math.cos(a), -Math.sin(a), 0);
        },
        96,
      );
      const outC = new CurveBuilder();
      const pout = hermite(yBot, y1, xw + H, 0, PORT_SLOPE);
      outC.add((u) => V(xw - (xw + H) * u, pout(u), 0), null, 48);
      return [
        { name: 'in', curve: inC, channel: 'trough' },
        { name: 'ride', curve: ride, channel: 'tube', wheel: true },
        { name: 'out', curve: outC, channel: 'trough' },
      ];
    },
    links: [['in', 'ride'], ['ride', 'out']],
    portLane: { in: ['in', 'start'], out: ['out', 'end'] },
  };
}

// A splitter: the marble arrives from the west and a see-saw flipper sends
// each marble the other way from the last, round a left or right curve.
function splitterDef(id) {
  return {
    id,
    cells: [[0, 0]],
    ports: {
      in: { cell: [0, 0], face: 'W', dl: 1, dir: 'in' },
      left: { cell: [0, 0], face: 'N', dl: 0, dir: 'out' },
      right: { cell: [0, 0], face: 'S', dl: 0, dir: 'out' },
    },
    splitter: true,
    lanes() {
      const pl = new Path2().arc(-H, -H, H, Math.PI / 2, 0);
      const pr = new Path2().arc(-H, H, H, -Math.PI / 2, 0);
      return [
        { name: 'left', curve: flatLane(pl, portY(1), portY(0)), channel: 'trough' },
        { name: 'right', curve: flatLane(pr, portY(1), portY(0)), channel: 'trough' },
      ];
    },
    portLane: { in: ['switch', 'start'], left: ['left', 'end'], right: ['right', 'end'] },
  };
}

// The end of a run: a tray with a dip, where marbles gather.
function catcherDef(id, goal = false) {
  return {
    id,
    cells: [[0, 0]],
    ports: { in: { cell: [0, 0], face: 'W', dl: 1, dir: 'in' } },
    goal,
    lanes() {
      const c = new CurveBuilder();
      const y0 = portY(1);
      const yd = portY(0) - 0.004;
      const pa = hermite(y0, yd, H + 0.004, PORT_SLOPE, 0);
      c.add((u) => V(-H + (H + 0.004) * u, pa(u), 0), null, 32);
      const pb = hermite(yd, yd + 0.005, H - 0.006, 0, -0.25);
      c.add((u) => V(0.004 + (H - 0.01) * u, pb(u), 0), null, 32);
      return [{ name: 'main', curve: c, channel: 'deep', surface: 'wood', rr: 0.07, e: 0.2 }];
    },
    portLane: { in: ['main', 'start'] },
  };
}

// Where marbles come in: a cup (or hopper) over a short run with a back wall.
function startDef(id) {
  return {
    id,
    cells: [[0, 0]],
    ports: { out: { cell: [0, 0], face: 'E', dl: 0, dir: 'out' } },
    start: true,
    lanes() {
      const x0 = -H + R_MARBLE + 0.002;
      const path = new Path2().line(x0, 0, H, 0);
      return [{ name: 'main', curve: flatLane(path, portY(0) + PORT_SLOPE * (H - x0) + 0.004, portY(0), 0.05, PORT_SLOPE), channel: 'deep' }];
    },
    spawn: V(-0.004, portY(0) + 0.07, 0),
    portLane: { out: ['main', 'end'] },
  };
}

// A lift: marbles roll into its foot, wait their turn, ride up a spiral
// (or a wheel, or a waterfall, as the level's skin shows it) and roll out
// at the top. p.h is its height in steps.
function liftDef(id) {
  return {
    id,
    cells: [[0, 0]],
    variable: true,
    ports: (p) => ({
      in: { cell: [0, 0], face: 'W', dl: 1, dir: 'in' },
      out: { cell: [0, 0], face: p.out === 'W' ? 'W' : 'E', dl: p.h ?? 30, dir: 'out' },
    }),
    lift: true,
    lanes(p) {
      const h = p.h ?? 30;
      const intake = new CurveBuilder();
      const y0 = portY(1);
      const yd = portY(0);
      const pa = hermite(y0, yd, H - 0.004, PORT_SLOPE, 0.12);
      intake.add((u) => V(-H + (H - 0.004) * u, pa(u), 0), null, 32);
      // the ride: a spiral round the column's axis, from the foot to the top
      const yTop = portY(h) + 0.012;
      const rr = 0.007;
      const turns = Math.max(1, Math.round((yTop - yd) / 0.035));
      const ride = new CurveBuilder();
      ride.add((u) => {
        const a = u * turns * 2 * Math.PI;
        const k = Math.min(1, u * 12, (1 - u) * 12);
        return V(-0.004 + rr * Math.sin(a) * k, yd + (yTop - yd) * u, -rr * (1 - Math.cos(a)) * k);
      }, null, Math.max(64, turns * 48));
      // the outlet leaves east, or back west over the intake
      const out = new CurveBuilder();
      const xe = p.out === 'W' ? -H : H;
      const po = hermite(yTop, portY(h), Math.abs(xe + 0.004), 0.05, PORT_SLOPE);
      out.add((u) => V(-0.004 + (xe + 0.004) * u, po(u), 0), null, 32);
      return [
        { name: 'intake', curve: intake, channel: 'deep' },
        { name: 'ride', curve: ride, channel: 'tube', kinematic: { speed: 0.1 }, rmf: true },
        { name: 'outlet', curve: out, channel: 'deep' },
      ];
    },
    links: [['ride', 'outlet']],
    intake: ['intake', 'ride'],
    // marbles tapped in drop into the top of the lift
    spawnAt: (p) => V(p.out === 'W' ? -0.013 : 0.009, portY(p.h ?? 30) + 0.075, 0),
    portLane: { in: ['intake', 'start'], out: ['outlet', 'end'] },
  };
}

export const PIECES = {};
function def(d) {
  PIECES[d.id] = d;
}

def(straightDef('straight', 1, 1));
def(straightDef('long', 2, 1));
def(straightDef('long3', 3, 2));
def(straightDef('steep', 1, 3));
def(straightDef('tube2', 2, 1, { channel: 'tube', surface: 'acrylic', tubeLook: true }));
def(straightDef('tube3', 3, 2, { channel: 'tube', surface: 'acrylic', tubeLook: true }));
def(straightDef('bell', 1, 1, { bell: true }));
def(straightDef('spinner', 1, 1, { spinner: true }));
def(curveDef('curveL', -1));
def(curveDef('curveR', 1));
def(bendDef('bendL', -1));
def(bendDef('bendR', 1));
def(uturnDef('uturnR', 1));
def(uturnDef('uturnL', -1));
def(dropDef('drop', 5));
def(dropDef('tallDrop', 10));
def(funnelDef('funnel', 2));
def(funnelDef('bigFunnel', 3));
def(loopDef('loop', 0.034, 13, 3));
def(loopDef('bigLoop', 0.045, 18, 4));
def(wheelDef('wheel'));
def(splitterDef('splitter'));
def(catcherDef('catcher'));
def(catcherDef('goal', true));
def(startDef('start'));
def(liftDef('lift'));

export function portsOf(defn, opts = {}) {
  return typeof defn.ports === 'function' ? defn.ports(opts) : defn.ports;
}
