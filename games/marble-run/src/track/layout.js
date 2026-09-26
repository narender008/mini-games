// A layout: pieces placed on a level's build grid, turned into world-space
// lanes that are joined port to port, with the supports under them, the
// mechanisms they carry and the funnels and lifts the simulation needs.
//
// A placement is { id, type, i, j, level, rot, h?, locked? }: the piece's
// local cell (0, 0) goes to grid cell (i, j), its level 0 to height step
// `level`, turned `rot` quarter turns clockwise seen from above (rot 1 sends
// a piece's east, the way marbles leave, to the south, towards the camera).
import * as THREE from 'three';
import { CELL, LEVEL } from '../config.js';
import { Lane, DS } from './path.js';
import { PIECES, FACES, portsOf, portY } from './pieces.js';

const BODY_BELOW = 0.018; // a trough's body reaches this far under its lane
const BODY_ABOVE = 0.013; // and its walls this far above

export function rotXZ(x, z, rot) {
  switch (rot & 3) {
    case 1:
      return [-z, x];
    case 2:
      return [-x, -z];
    case 3:
      return [z, -x];
    default:
      return [x, z];
  }
}

export class Layout {
  // grid: { origin: Vector3 (world centre of cell (0, 0) at level 0),
  //   min: [i, j], max: [i, j], blocked?(i, j) -> bool }
  constructor(grid) {
    this.grid = grid;
    this.placements = [];
    this.nextId = 1;
    this.built = null;
  }

  static from(grid, list) {
    const L = new Layout(grid);
    for (const p of list) L.add(p);
    return L;
  }

  add(p) {
    const q = { rot: 0, level: 0, ...p, id: p.id ?? this.nextId++ };
    this.nextId = Math.max(this.nextId, q.id + 1);
    this.placements.push(q);
    return q;
  }

  remove(id) {
    this.placements = this.placements.filter((p) => p.id !== id);
  }

  get(id) {
    return this.placements.find((p) => p.id === id);
  }

  toJSON() {
    // everything but the id: lift outlets, tints and bell notes come along
    return this.placements.map(({ id, ...p }) => p);
  }

  // world position of a local point of a placement
  toWorld(p, x, y, z, out = new THREE.Vector3()) {
    const [rx, rz] = rotXZ(x, z, p.rot);
    const o = this.grid.origin;
    return out.set(o.x + p.i * CELL + rx, o.y + p.level * LEVEL + y, o.z + p.j * CELL + rz);
  }

  cellsOf(p) {
    return PIECES[p.type].cells.map(([a, b]) => {
      const [ra, rb] = rotXZ(a, b, p.rot);
      return [p.i + ra, p.j + rb];
    });
  }

  // Build everything the simulation and the skins need. Returns
  // { pieces: [inst], lanes, bowls, lifts, pillars, spawns, ports }.
  build() {
    const pieces = [];
    const lanes = [];
    const bowls = [];
    const lifts = [];
    const spawns = [];
    const portIndex = new Map();
    for (const p of this.placements) {
      const inst = this.buildPiece(p);
      pieces.push(inst);
      lanes.push(...inst.lanes);
      if (inst.bowl) bowls.push(inst.bowl);
      if (inst.lift) lifts.push(inst.lift);
      if (inst.spawn) spawns.push(inst);
      for (const port of inst.ports) {
        const list = portIndex.get(port.key) || [];
        list.push(port);
        portIndex.set(port.key, list);
      }
    }
    // join outs to ins that share a face and a height
    for (const list of portIndex.values()) {
      const outs = list.filter((q) => q.dir === 'out');
      const ins = list.filter((q) => q.dir === 'in');
      if (!outs.length || !ins.length) continue;
      const a = outs[0];
      const b = ins.find((q) => q.inst !== a.inst) || null;
      if (!b) continue;
      join(a, b);
      a.linked = b;
      b.linked = a;
    }
    const pillars = this.supports(pieces);
    this.built = { pieces, lanes, bowls, lifts, pillars, spawns, ports: [...portIndex.values()].flat() };
    return this.built;
  }

  buildPiece(p) {
    const defn = PIECES[p.type];
    if (!defn) throw new Error(`unknown piece ${p.type}`);
    const inst = { placement: p, def: defn, lanes: [], laneByName: {}, ports: [], mech: {}, cells: this.cellsOf(p), layoutOrigin: this.grid.origin };
    const toWorld = (v) => this.toWorld(p, v.x, v.y, v.z);
    const rotDir = (v) => {
      const [x, z] = rotXZ(v.x, v.z, p.rot);
      return new THREE.Vector3(x, v.y, z);
    };
    for (const spec of defn.lanes(p)) {
      const { pts, ups } = spec.curve.build();
      const wp = pts.map(toWorld);
      const wu = ups ? ups.map(rotDir) : null;
      const lane = new Lane(wp, wu, {
        channel: spec.channel,
        surface: spec.surface,
        rmf: spec.rmf,
        rr: spec.rr,
        e: spec.e,
        up0: spec.up0 ? rotDir(spec.up0) : null,
        kinematic: spec.kinematic,
        piece: inst,
        name: spec.name,
      });
      lane.spec = spec;
      inst.lanes.push(lane);
      inst.laneByName[spec.name] = lane;
    }
    // every lane end is closed unless it is a way out (open until joined)
    for (const lane of inst.lanes) {
      lane.start = { type: 'wall' };
      lane.end = { type: 'wall' };
    }
    const portDefs = portsOf(defn, p);
    for (const q of Object.keys(portDefs)) {
      const [laneName, end] = defn.portLane[q];
      const lane = inst.laneByName[laneName];
      if (lane && portDefs[q].dir === 'out') lane[end] = { type: 'open' };
    }
    for (const n of ['left', 'right']) if (defn.splitter) inst.laneByName[n].end = { type: 'open' };
    // internal joins
    for (const [a, b] of defn.links || []) linkLanes(inst.laneByName[a], inst.laneByName[b]);
    // ports
    for (const [name, q] of Object.entries(portDefs)) {
      const [ca, cb] = q.cell;
      const [fx, fz] = FACES[q.face];
      const [wa, wb] = rotXZ(ca, cb, p.rot);
      const [wfx, wfz] = rotXZ(fx, fz, p.rot);
      const wi = p.i + wa;
      const wj = p.j + wb;
      const level = p.level + q.dl;
      const key = `${2 * wi + wfx},${2 * wj + wfz},${level}`;
      const pos = this.toWorld(p, ca * CELL + (fx * CELL) / 2, portY(q.dl), cb * CELL + (fz * CELL) / 2);
      const [laneName, end] = defn.portLane[name];
      inst.ports.push({ inst, name, dir: q.dir, key, pos, face: [wfx, wfz], cell: [wi, wj], level, laneName, end, lane: inst.laneByName[laneName] || null, linked: null });
    }
    // mechanisms and special parts
    const main = inst.laneByName.main;
    if (defn.bell && main) {
      inst.mech.bell = { swing: 0, vel: 0, index: 0, ring: 0 };
      main.events.push({ s: main.length * 0.55, type: 'bell', mech: inst.mech.bell, inst });
    }
    if (defn.spinner && main) {
      inst.mech.spinner = { angle: 0, omega: 0 };
      main.events.push({ s: main.length * 0.5, type: 'spinner', mech: inst.mech.spinner, inst });
    }
    if (defn.splitter) {
      inst.mech.splitter = { side: 0, tilt: 0 };
    }
    if (defn.wheel) {
      const ride = inst.laneByName.ride;
      const w = defn.wheel;
      const centre = this.toWorld(p, w.x, 0, 0);
      centre.y = ride.pos[1] - w.radius;
      inst.mech.wheel = { angle: 0, omega: 0, radius: w.radius, centre, driven: false };
      ride.wheel = inst.mech.wheel;
    }
    if (defn.loop && main) {
      // the top of the loop (where the track is upside down), for "went
      // round the loop" checks
      let top = 0;
      let best = Infinity;
      for (let i = 0; i < main.n; i++) {
        if (main.up[i * 3 + 1] < best) {
          best = main.up[i * 3 + 1];
          top = i;
        }
      }
      inst.mech.loop = { topS: top * DS };
      main.events.push({ s: top * DS, type: 'loopTop', inst });
      main.events.push({ s: main.length - 0.01, type: 'loopEnd', inst });
    }
    if (defn.goal && main) {
      inst.mech.goal = { glow: 0, count: 0 };
      main.events.push({ s: main.length * 0.5, type: 'goal', mech: inst.mech.goal, inst });
    }
    if (defn.bowl) {
      const b = defn.bowl;
      const centre = this.toWorld(p, b.cx, portY(b.rimDl), b.cz);
      const bowl = {
        inst,
        x: centre.x,
        z: centre.z,
        rimY: centre.y,
        R: b.R,
        depth: b.depth,
        hole: b.hole,
        exit: inst.laneByName.out,
      };
      // a gravity well: shallow at the rim, steep near the hole
      const k = b.R / b.hole - 1;
      bowl.f = (rho) => -b.depth * (b.R / rho - 1) / k;
      bowl.fp = (rho) => (b.depth * b.R) / (rho * rho * k);
      bowl.fpp = (rho) => (-2 * b.depth * b.R) / (rho * rho * rho * k);
      inst.bowl = bowl;
      inst.laneByName.in.end = { type: 'bowl', bowl };
      inst.mech.bowl = bowl;
    }
    if (defn.lift) {
      const ride = inst.laneByName.ride;
      const intake = inst.laneByName.intake;
      const lift = { inst, ride, intake, speed: ride.kinematic.speed, spacing: 0.034, riders: [], phase: 0, running: 0 };
      intake.end = { type: 'lift', lift };
      ride.start = { type: 'wall' };
      // a marble knocked back at the top must not roll into the moving ride,
      // which the sim does not step
      inst.laneByName.outlet.start = { type: 'wall' };
      inst.lift = lift;
      inst.mech.lift = lift;
    }
    if (defn.start) inst.spawn = this.toWorld(p, defn.spawn.x, defn.spawn.y, defn.spawn.z);
    if (defn.spawnAt) {
      const v = defn.spawnAt(p);
      inst.spawn = this.toWorld(p, v.x, v.y, v.z);
    }
    // piece extents per cell, for supports and overlap tests
    inst.extent = this.extentOf(inst);
    return inst;
  }

  // For each footprint cell: the lowest and highest the piece's body reaches.
  extentOf(inst) {
    const o = this.grid.origin;
    const byCell = new Map();
    for (const c of inst.cells) byCell.set(`${c[0]},${c[1]}`, { i: c[0], j: c[1], lo: Infinity, hi: -Infinity });
    let lo = Infinity;
    let hi = -Infinity;
    for (const lane of inst.lanes) {
      for (let k = 0; k < lane.n; k++) {
        const x = lane.pos[k * 3];
        const y = lane.pos[k * 3 + 1];
        const z = lane.pos[k * 3 + 2];
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
        const i = Math.round((x - o.x) / CELL);
        const j = Math.round((z - o.z) / CELL);
        const e = byCell.get(`${i},${j}`);
        if (e) {
          e.lo = Math.min(e.lo, y);
          e.hi = Math.max(e.hi, y);
        }
      }
    }
    const tall = inst.def.tall ? true : false;
    for (const e of byCell.values()) {
      if (!Number.isFinite(e.lo) || tall) {
        e.lo = lo;
        e.hi = hi;
      }
      e.lo -= BODY_BELOW;
      e.hi += BODY_ABOVE;
    }
    return [...byCell.values()];
  }

  // Pillars: under every piece, in every cell it fills, down to whatever is
  // below it in that cell (another piece or the ground).
  supports(pieces) {
    const byCell = new Map();
    for (const inst of pieces) {
      for (const e of inst.extent) {
        // a funnel stands on one post under its middle; the rest of its
        // footprint is open underneath
        if (inst.def.support === 'centre') {
          const n = Math.round(Math.sqrt(inst.def.cells.length));
          const mid = Math.floor(n / 2);
          const [ra, rb] = rotXZ(mid, mid, inst.placement.rot);
          const isMid = e.i === inst.placement.i + ra && e.j === inst.placement.j + rb;
          if (!isMid) {
            const k0 = `${e.i},${e.j}`;
            const list0 = byCell.get(k0) || [];
            list0.push({ inst, lo: e.lo, hi: e.hi, i: e.i, j: e.j, float: true });
            byCell.set(k0, list0);
            continue;
          }
        }
        const k = `${e.i},${e.j}`;
        const list = byCell.get(k) || [];
        list.push({ inst, lo: e.lo, hi: e.hi, i: e.i, j: e.j });
        byCell.set(k, list);
      }
    }
    const ground = this.grid.origin.y;
    const all = [];
    for (const list of byCell.values()) {
      list.sort((a, b) => a.lo - b.lo);
      let floor = ground;
      for (const e of list) {
        if (e.float) {
          floor = Math.max(floor, e.hi);
          continue;
        }
        if (e.lo - floor > 0.004) {
          const x = this.grid.origin.x + e.i * CELL;
          const z = this.grid.origin.z + e.j * CELL;
          all.push({ i: e.i, j: e.j, x, z, y0: floor, y1: e.lo, inst: e.inst });
        }
        floor = Math.max(floor, e.hi);
      }
    }
    // A column under every cell would be a solid wall. Like a real kit,
    // posts stand on a lattice every other cell and tracks span between
    // them; a piece with no lattice cell gets one post under its middle.
    const site = (c) => ((c.i % 2) + 2) % 2 === 0 && ((c.j % 2) + 2) % 2 === 1;
    const kept = all.filter(site);
    const held = new Set(kept.map((c) => c.inst));
    const byInst = new Map();
    for (const c of all) {
      if (held.has(c.inst)) continue;
      if (!byInst.has(c.inst)) byInst.set(c.inst, []);
      byInst.get(c.inst).push(c);
    }
    for (const list of byInst.values()) kept.push(list[Math.floor(list.length / 2)]);
    return kept;
  }
}

function linkLanes(a, b) {
  a.end = { type: 'link', lane: b, atEnd: false };
  b.start = { type: 'link', lane: a, atEnd: true };
}

// Join an out port to an in port. Splitter ins become a switch.
function join(out, inp) {
  const a = out.lane;
  if (!a) return;
  const end = out.end;
  if (inp.laneName === 'switch') {
    const sp = inp.inst;
    const options = [sp.laneByName.left, sp.laneByName.right];
    const target = { type: 'switch', mech: sp.mech.splitter, options, inst: sp };
    if (end === 'end') a.end = target;
    else a.start = target;
    for (const o of options) o.start = { type: 'link', lane: a, atEnd: end === 'end' };
    return;
  }
  const b = inp.lane;
  if (!b) return;
  const bEnd = inp.end;
  if (end === 'end') a.end = { type: 'link', lane: b, atEnd: bEnd === 'end' };
  else a.start = { type: 'link', lane: b, atEnd: bEnd === 'end' };
  if (bEnd === 'start') b.start = { type: 'link', lane: a, atEnd: end === 'end' };
  else b.end = { type: 'link', lane: a, atEnd: end === 'end' };
}
