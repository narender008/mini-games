// Toy Tanks physics: every ball burst pushes the world for real.
//
// A Rapier world (metres, real gravity, real toy masses) that only exists in
// the places a burst reaches. Everything that can move is a "loose thing":
//   * the ground under the lane: a mosaic of small heightfield tiles read from
//     terrain.heightAt. A burst digs its crater in the terrain first, then the
//     tiles under it are rebuilt, so debris lands in the crater it left.
//   * debris chunks: little clods of the stage's own ground (soil and turf, sand,
//     mud, snow, moss), thrown out of the crater along its walls. Two
//     InstancedMeshes with photographed PBR sets, capped, recycled oldest first,
//     sinking softly into the ground when their time is up.
//   * props (props.js: userData.prop + PROP_INFO[id].loose): bucket, spade, can,
//     pot, shells, starfish, log. A convex hull of the model with the real
//     toy's mass.
//   * scattered instances (world/rocks.js pebbles and clods, world/shells.js):
//     InstancedMeshes tagged userData.loose. Only the instances a burst reaches
//     get a body; they are written back into the instance buffer while they
//     move and go back to plain static instances when they settle.
//   * targets (targets.js): block towers and bullseye stands become real
//     stacks and stands that tip and tumble; balloons (and the bonus star) sway
//     on their strings with a small pendulum of their own and swing back.
//
// Idle cost is nothing: a body exists only from the burst that wakes it until it
// has been calm for a moment, and step() does no work while none does. After the
// first step at stage load (see warm) nothing here compiles or allocates on the
// first burst; all meshes and materials are in the scene from setStage on (at
// count 0) so main.prepareScene() compiles them then.
//
// Sharp edges (each cost an evening):
//   * Rapier's heightfield is column-major: heights[row + col * (rows + 1)] with
//     the row along z and the column along x, centred on its translation.
//   * A 5 mm clod crosses its own size in one 1/100 s step when thrown, so chunks
//     use CCD, and after every read a chunk still under the ground is put back on
//     it (terrainGuard); nothing thrown ever ends up below the terrain.
//   * lengthUnit is 2 cm: Rapier scales its tolerances and sleep thresholds by it.
//   * A flat-faced hull resting on the ground's 1 cm triangles costs 6 to 9 times a ball (a dozen
//     contact points; measured in the browser, 85 to 130 us per body per 10 ms step). So chunks and
//     scattered lumps are balls (angular damping 8 and the stick rule keep them from creeping down
//     slopes), scattered shells are boxes fitted to their shape, and only the props (a handful,
//     awake for a second or two) and the target stand are real hulls and compounds.
//   * One burst wakes at most INST_CAP scattered things (the hardest hit): 40 / 28 / 16 by quality.
//   * Props are placed sunk into the ground. A body made for a sunk prop gets its
//     hull cut at the ground line, or Rapier would spit it out of the sand.
//   * Blocks, stand and towers come from targets.js (it.blocks, the bullseye's face
//     group). Their meshes are re-parented to targets.group at the first wake;
//     targets.onClear lets go of them.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { reactors } from './world/react.js';
import { loadPBR } from './env.js';
import { rockGeometry } from './world/rocks.js';
import { clamp } from './config.js';

// ---------------------------------------------------------------------------------------------- tuning

const G = 9.81;
const LENGTH_UNIT = 0.02; // "typical object size" for Rapier's tolerances
const SUB_DT = 1 / 100; // longest substep
const SUB_MAX = 4; // substeps in one frame

// the ground: 0.4 m tiles over the play area, 1 cm cells in the band round the lane (craters), 2 cm elsewhere
const TILE = 0.4;
const TILES_X = 13; // x from -2.6 to 2.6
const TILES_Z = 7; // z from -1.4 to 1.4
const HALF_X = (TILES_X * TILE) / 2;
const HALF_Z = (TILES_Z * TILE) / 2;
const FINE = 40;
const COARSE = 20;

// debris per ground: which texture set makes the two kinds of lump (a = 'dug' or 'base' of the stage's ground), their share, densities
// (kg/m3), size range (mm, diameter), count factor, restitution, friction, linear and angular damping, roundness
const CHUNKS = {
  grass: { a: 'dug', b: 'base', mixA: 0.6, dens: [1500, 1100], size: [4, 14], count: 1, e: 0.3, mu: 0.85, lin: 0.12, ang: 5, round: 0.3, tintA: 0.85, tintB: 0.95 },
  sand: { a: 'dug', b: 'base', mixA: 0.45, dens: [1700, 1500], size: [3, 10], count: 1.35, e: 0.14, mu: 0.9, lin: 0.2, ang: 7, round: 0.4, tintA: 0.95, tintB: 1.02 },
  mud: { a: 'base', b: 'dug', mixA: 0.7, dens: [1800, 1500], size: [5, 15], count: 1, e: 0.04, mu: 1, lin: 0.35, ang: 9, round: 0.35, tintA: 0.8, tintB: 0.9 },
  snow: { a: 'base', b: 'dug', mixA: 0.75, dens: [450, 500], size: [5, 14], count: 1.1, e: 0.06, mu: 0.6, lin: 0.25, ang: 8, round: 0.3, tintA: 1.0, tintB: 0.94 },
  moss: { a: 'base', b: 'dug', mixA: 0.5, dens: [500, 1400], size: [5, 14], count: 1, e: 0.15, mu: 0.9, lin: 0.15, ang: 6, round: 0.3, tintA: 0.95, tintB: 0.9 },
};
const CAP = { high: 150, medium: 110, low: 70 };
const BALL_BELOW = 0.016; // scattered lumps smaller than this (largest radius, m) are swept for continuous collision, bigger ones cannot pass through the ground in a step
const INST_CAP = { high: 40, medium: 28, low: 16 }; // scattered pebbles and shells one burst wakes at most (the nearest, the hardest hit)
const UV_SPAN = 0.05; // how much of a texture tile one chunk shows (the real thing would be far less: it would be a blur)
const CHUNK_LIFE = [8, 12]; // s before a resting chunk sinks
const SINK_TIME = 1.6;

// materials of the scattered instances: density, friction, restitution
const STONES = {
  stone: { dens: 2600, mu: 0.6, e: 0.32 },
  sand: { dens: 1500, mu: 0.9, e: 0.08 },
  shell: { dens: 800, mu: 0.5, e: 0.25 },
  starfish: { dens: 500, mu: 0.8, e: 0.1 },
  glass: { dens: 2500, mu: 0.4, e: 0.3 },
};

// what a burst does. Speed change at the centre for a 8 g body: V0 + V1 * power (m/s); lighter bodies get more, heavier less
const V0 = 0.8;
const V1 = 1.5;
const V_CAP = 2.4;
const REF_MASS = 0.008;

// calm: below these speeds for CALM_TIME the body goes back to being scenery
const CALM_V2 = 0.012 * 0.012;
const CALM_W2 = 0.8 * 0.8;
const CALM_TIME = 0.28;
const STICK_V2 = 0.11 * 0.11; // a chunk on the ground slower than this stays put
const MAX_AWAKE = 7; // s: anything still moving after this is put down where it is

const T_CHUNK = 0;
const T_PROP = 1;
const T_INST = 2;
const T_BLOCK = 3;
const T_STAND = 4;

const F_FREE = 0;
const F_FLY = 1;
const F_REST = 2;
const F_SINK = 3;

// ---------------------------------------------------------------------------------------------- scratch

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const RV = { x: 0, y: 0, z: 0 };
const RQ = { x: 0, y: 0, z: 0, w: 1 };
const LV = { x: 0, y: 0, z: 0 };
const AV = { x: 0, y: 0, z: 0 };
const UP = new THREE.Vector3(0, 1, 0);

const rand = Math.random;
const byDv = (a, b) => b.dv - a.dv;
// the sound bank of audio.knock has plastic, wood, shell, stone, metal and clod
const KNOCK_SOUND = { clay: 'clod', sand: 'clod', glass: 'stone', starfish: 'shell' };
const between = (a, b) => a + (b - a) * rand();

// ---------------------------------------------------------------------------------------------- hulls

// n directions spread evenly over the sphere (plus the six axes, for flat things)
function directions(n) {
  const out = new Float32Array((n + 6) * 3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out[i * 3] = Math.cos(ga * i) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(ga * i) * r;
  }
  const axes = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  out.set(axes, n * 3);
  return out;
}

// The extreme points of some meshes in n directions: a few points whose convex hull is the shape. list: [{ geo, matrix | null }]
function extremes(list, n) {
  const dirs = directions(n);
  const K = n + 6;
  const best = new Float64Array(K).fill(-Infinity);
  const at = new Float32Array(K * 3);
  for (const { geo, matrix } of list) {
    const pos = geo.attributes.position;
    const e = matrix ? matrix.elements : null;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      if (e) {
        const tx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const ty = e[1] * x + e[5] * y + e[9] * z + e[13];
        z = e[2] * x + e[6] * y + e[10] * z + e[14];
        x = tx;
        y = ty;
      }
      for (let k = 0; k < K; k++) {
        const d = x * dirs[k * 3] + y * dirs[k * 3 + 1] + z * dirs[k * 3 + 2];
        if (d > best[k]) {
          best[k] = d;
          at[k * 3] = x;
          at[k * 3 + 1] = y;
          at[k * 3 + 2] = z;
        }
      }
    }
  }
  // the same point often wins several directions
  const out = [];
  for (let k = 0; k < K; k++) {
    let dup = false;
    for (let j = 0; j < out.length; j += 3) {
      if (Math.abs(out[j] - at[k * 3]) + Math.abs(out[j + 1] - at[k * 3 + 1]) + Math.abs(out[j + 2] - at[k * 3 + 2]) < 1e-6) {
        dup = true;
        break;
      }
    }
    if (!dup) out.push(at[k * 3], at[k * 3 + 1], at[k * 3 + 2]);
  }
  return Float32Array.from(out);
}

// ---------------------------------------------------------------------------------------------- the world

export class Physics {
  static async create(app) {
    await RAPIER.init();
    const p = new Physics(app);
    try {
      p.propInfo = (await import('./props.js')).PROP_INFO;
    } catch (err) {
      console.warn('physics: no props', err);
    }
    reactors.add(p);
    if (app.targets) app.targets.onClear = () => p.releaseTargets();
    return p;
  }

  constructor(app) {
    this.app = app;
    const world = new RAPIER.World({ x: 0, y: -G, z: 0 });
    world.lengthUnit = LENGTH_UNIT;
    world.integrationParameters.contact_natural_frequency = 45;
    this.world = world;
    this.queue = new RAPIER.EventQueue(true);
    this.ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.group = new THREE.Group();
    this.group.name = 'physics';
    app.scene.add(this.group);
    this.ready = false;
    this.token = 0;
    this.terrain = null;
    this.tiles = [];
    this.touched = new Set(); // tiles that carry a crater
    this.act = []; // records with a body right now
    this.props = [];
    this.insts = [];
    this.statics = [];
    this.instMeshes = [];
    this.opts = { ccd: true };
    this.propInfo = {};
    this.hulls = new Map(); // prop id -> extreme points
    this.instHulls = new WeakMap(); // geometry -> extreme points (goes with the stage that made the geometry)
    this.sways = []; // balloons and stars on the move
    this.towers = []; // block towers and stands with bodies
    this.claimed = []; // meshes taken from targets.js
    this.tankBodies = [null, null]; // the tanks' boxes (kinematic), so debris and toys bounce off them
    this.evMap = new Map(); // collider handle -> record, for knocks
    this.knock = { wood: 0, plastic: 0, metal: 0, clay: 0, shell: 0, stone: 0, glass: 0, sand: 0, starfish: 0 };
    this.knockX = { wood: 0, plastic: 0, metal: 0, clay: 0, shell: 0, stone: 0, glass: 0, sand: 0, starfish: 0 };
    this.knockAt = 0;
    this.stepCount = 0;
    this.patterN = 0;
    this.patterV = 0;
    this.patterX = 0;
    this.patterAt = 0;
    this.time = 0;
    this.stats = { awake: 0, chunks: 0, ms: 0, steps: 0, blastMs: 0, peak: 0, bodies: 0 };
    this._onForce = (ev) => this.forceEvent(ev);
    this.chunks = new Chunks(this);
  }

  // ------------------------------------------------------------ stage

  async setStage({ stage, terrain, view, layout }) {
    const tok = ++this.token;
    this.ready = false;
    this.clearStage();
    this.terrain = terrain;
    this.stage = stage;
    this.view = view;
    this.layout = layout;
    this.buildTiles();
    await this.chunks.setStage(stage, terrain, this.app.quality);
    if (tok !== this.token) return;
    if (view?.group) this.discover(view.group);
    this.warm();
    this.ready = true;
  }

  clearStage() {
    for (const r of this.act) this.dropBody(r);
    this.act.length = 0;
    this.sways.length = 0;
    this.towers.length = 0;
    this.releaseTargets();
    this.dropTanks();
    for (const t of this.tiles) if (t.col) this.world.removeCollider(t.col, false);
    this.tiles.length = 0;
    for (const s of this.statics) this.world.removeCollider(s, false);
    this.statics.length = 0;
    this.touched.clear();
    this.props.length = 0;
    this.insts.length = 0;
    this.instMeshes.length = 0;
    this.chunks.clear();
    this.evMap.clear();
  }

  // the ground tiles
  buildTiles() {
    for (let iz = 0; iz < TILES_Z; iz++) {
      for (let ix = 0; ix < TILES_X; ix++) {
        const cx = -HALF_X + (ix + 0.5) * TILE;
        const cz = -HALF_Z + (iz + 0.5) * TILE;
        const n = Math.abs(cz) <= 0.61 ? FINE : COARSE;
        const t = { cx, cz, n, h: new Float32Array((n + 1) * (n + 1)), col: null };
        this.tiles.push(t);
        this.fillTile(t);
      }
    }
  }

  fillTile(t) {
    const { n, h } = t;
    const cell = TILE / n;
    const x0 = t.cx - TILE / 2;
    const z0 = t.cz - TILE / 2;
    const T = this.terrain;
    for (let j = 0; j <= n; j++) {
      const x = x0 + j * cell;
      for (let i = 0; i <= n; i++) h[i + j * (n + 1)] = T.heightAt(x, z0 + i * cell);
    }
    if (t.col) this.world.removeCollider(t.col, true);
    t.col = this.world.createCollider(
      RAPIER.ColliderDesc.heightfield(n, n, h, { x: TILE, y: 1, z: TILE }).setTranslation(t.cx, 0, t.cz).setFriction(0.9).setRestitution(0.05),
      this.ground,
    );
  }

  // rebuild the tiles a crater reaches (past 1.6 radii it moves the ground by less than a tenth of a millimetre)
  patchGround(x, z, r) {
    const reach = r * 1.6 + 0.01;
    const ix0 = Math.max(0, Math.floor((x - reach + HALF_X) / TILE));
    const ix1 = Math.min(TILES_X - 1, Math.floor((x + reach + HALF_X) / TILE));
    const iz0 = Math.max(0, Math.floor((z - reach + HALF_Z) / TILE));
    const iz1 = Math.min(TILES_Z - 1, Math.floor((z + reach + HALF_Z) / TILE));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const k = iz * TILES_X + ix;
        this.fillTile(this.tiles[k]);
        this.touched.add(k);
      }
    }
  }

  // The loose things of a stage: props with userData.prop, InstancedMeshes with userData.loose.
  discover(root) {
    root.updateWorldMatrix(true, true);
    const PROP_INFO = this.propInfo;
    root.traverse((o) => {
      const id = o.userData?.prop;
      if (id && PROP_INFO[id]) {
        const info = PROP_INFO[id];
        if (info.loose) this.addProp(o, id, info);
        else if (info.solid) this.addSolid(o, info);
      } else if (o.isInstancedMesh && o.userData.loose) this.addInstances(o);
    });
  }

  addSolid(o, info) {
    o.matrixWorld.decompose(_p, _q, _s);
    const b = info.box;
    const hx = ((b[3] - b[0]) / 2) * Math.abs(_s.x) * 0.9;
    const hy = ((b[4] - b[1]) / 2) * Math.abs(_s.y) * 0.9;
    const hz = ((b[5] - b[2]) / 2) * Math.abs(_s.z) * 0.9;
    _v.set(((b[0] + b[3]) / 2) * _s.x, ((b[1] + b[4]) / 2) * _s.y, ((b[2] + b[5]) / 2) * _s.z).applyQuaternion(_q).add(_p);
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(_v.x, _v.y, _v.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }).setFriction(0.7).setRestitution(0.1),
      this.ground,
    );
    this.statics.push(col);
  }

  addProp(o, id, info) {
    let hull = this.hulls.get(id);
    if (!hull) {
      const list = [];
      o.updateWorldMatrix(true, true);
      _m2.copy(o.matrixWorld).invert();
      o.traverse((m) => {
        if (!m.isMesh) return;
        list.push({ geo: m.geometry, matrix: new THREE.Matrix4().multiplyMatrices(_m2, m.matrixWorld) });
      });
      hull = extremes(list, 42);
      this.hulls.set(id, hull);
    }
    o.matrixWorld.decompose(_p, _q, _s);
    const r = {
      type: T_PROP,
      obj: o,
      id,
      info,
      hull,
      x: _p.x,
      y: _p.y + (info.box[4] * _s.y) / 2,
      z: _p.z,
      rad: 0.5 * Math.hypot(info.size[0] * Math.abs(_s.x), info.size[1] * Math.abs(_s.y), info.size[2] * Math.abs(_s.z)),
      mass: info.loose.mass,
      mat: info.loose.material,
      home: { p: o.position.clone(), q: o.quaternion.clone() },
      body: null,
      calm: 0,
      awake: 0,
      inv: new THREE.Matrix4(),
      parentIdentity: true,
    };
    this.props.push(r);
  }

  addInstances(mesh) {
    const tag = mesh.userData.loose;
    const kind = STONES[tag.material] ?? STONES.stone;
    const dens = tag.density ?? kind.dens;
    let hull = this.instHulls.get(mesh.geometry);
    if (!hull) {
      hull = extremes([{ geo: mesh.geometry, matrix: null }], 8);
      this.instHulls.set(mesh.geometry, hull);
    }
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const gr = mesh.geometry.boundingSphere.radius;
    mesh.userData.home = new Float32Array(mesh.instanceMatrix.array);
    this.instMeshes.push(mesh);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _m);
      _m.decompose(_p, _q, _s);
      this.insts.push({
        type: T_INST,
        mesh,
        i,
        hull,
        mat: tag.material,
        dens,
        mu: kind.mu,
        e: kind.e,
        x: _p.x,
        y: _p.y,
        z: _p.z,
        qx: _q.x,
        qy: _q.y,
        qz: _q.z,
        qw: _q.w,
        sx: _s.x,
        sy: _s.y,
        sz: _s.z,
        rad: gr * Math.max(_s.x, _s.y, _s.z),
        mass: 0,
        body: null,
        calm: 0,
        awake: 0,
      });
    }
  }

  // A throw-away burst of bodies, so the first real burst does not pay for Rapier's first steps (17 ms for the very first, measured), the
  // first hull and ball contacts on a heightfield, the first continuous-collision sweeps
  warm() {
    const w = this.world;
    const T = this.terrain;
    const pts = new Float32Array([-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 0, 1, 0, 0.6, 0.2, -0.8]).map((v) => v * 0.005);
    const bodies = [];
    for (let i = 0; i < 24; i++) {
      const x = (i % 6) * 0.03 - 0.08;
      const z = Math.floor(i / 6) * 0.03 - 0.05;
      const b = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, T.heightAt(x, z) + 0.02, z).setLinvel(0.4, 0.5, 0.2).setAngvel({ x: 20, y: 5, z: 3 }).setCcdEnabled(true));
      w.createCollider(i % 3 ? RAPIER.ColliderDesc.ball(0.004).setDensity(1500) : RAPIER.ColliderDesc.convexHull(pts).setDensity(1500), b);
      bodies.push(b);
    }
    w.timestep = SUB_DT;
    for (let i = 0; i < 24; i++) {
      w.step(this.queue);
      this.queue.drainContactForceEvents(this._onForce);
    }
    for (const b of bodies) w.removeRigidBody(b);
    this.queue.clear();
  }

  // a new game: the terrain has been restored
  reset() {
    if (!this.ready) return;
    for (const r of this.act) this.dropBody(r);
    this.act.length = 0;
    this.towers.length = 0;
    this.sways.length = 0;
    this.releaseTargets();
    this.dropTanks();
    for (const k of this.touched) this.fillTile(this.tiles[k]);
    this.touched.clear();
    for (const r of this.props) {
      r.obj.position.copy(r.home.p);
      r.obj.quaternion.copy(r.home.q);
      r.obj.updateMatrix();
      r.calm = 0;
    }
    for (const m of this.instMeshes) {
      m.instanceMatrix.array.set(m.userData.home);
      m.instanceMatrix.needsUpdate = true;
    }
    for (const r of this.insts) {
      r.mesh.getMatrixAt(r.i, _m);
      _m.decompose(_p, _q, _s);
      r.x = _p.x;
      r.y = _p.y;
      r.z = _p.z;
      r.qx = _q.x;
      r.qy = _q.y;
      r.qz = _q.z;
      r.qw = _q.w;
    }
    this.chunks.clear();
    this.stats.awake = 0;
  }

  dispose() {
    this.ready = false;
    this.token++; // (a stage still loading gives up)
    reactors.delete(this);
    if (this.app.targets?.onClear) this.app.targets.onClear = null;
    this.chunks.dispose();
    this.app.scene.remove(this.group);
    this.world.free();
  }

  // ------------------------------------------------------------ the burst

  // The tanks are boxes (game.js sides[].shape, the same box a ball hits) that follow the tank while something is moving
  syncTanks() {
    const sides = this.app.game?.sides;
    if (!sides) return;
    for (let i = 0; i < 2; i++) {
      const sh = sides[i]?.shape;
      let tb = this.tankBodies[i];
      if (!sh || sh.y < -1 || sides[i].view?.object?.visible === false) {
        if (tb) {
          this.world.removeRigidBody(tb);
          this.tankBodies[i] = null;
        }
        continue;
      }
      if (!tb) {
        tb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(sh.x, sh.y, sh.z ?? 0));
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(sh.hx * 0.92, sh.hy * 0.92, sh.hz * 0.92).setFriction(0.6).setRestitution(0.1), tb);
        this.tankBodies[i] = tb;
      } else tb.setNextKinematicTranslation({ x: sh.x, y: sh.y, z: sh.z ?? 0 });
    }
  }

  dropTanks() {
    for (let i = 0; i < 2; i++) {
      if (this.tankBodies[i]) this.world.removeRigidBody(this.tankBodies[i]);
      this.tankBodies[i] = null;
    }
  }

  blast(e) {
    if (!this.ready || !this.terrain) return;
    const t0 = performance.now();
    this.syncTanks();
    const R = e.radius;
    const power = e.power;
    // speed change at the centre for the reference body
    this.v0 = (V0 + V1 * power) * (e.great ? 1.2 : 1) * Math.sqrt(e.scale);
    this.ex = e.x;
    this.ey = e.y;
    this.ez = e.z;
    this.eR = R;
    this.eDirX = Math.sign(e.vx) || 1;
    if (e.crater) this.patchGround(e.crater.x, e.crater.z, e.crater.r);
    // loose things, nearest to what the burst reaches
    for (const r of this.props) this.push(r, R);
    this.pushInsts(R);
    this.chunks.blast(e, R);
    this.blastTargets(e, R);
    if (e.crater) this.chunks.spawn(e);
    this.stats.blastMs = performance.now() - t0;
  }

  // the speed change (m/s) a burst gives a body of this mass at this distance, and the direction it goes
  kick(cx, cy, cz, rad, mass, R, out, lift = 0.85) {
    const dx = cx - this.ex;
    const dy = cy - this.ey;
    const dz = cz - this.ez;
    const d = Math.hypot(dx, dy, dz);
    const reach = R + rad * 0.6;
    if (d >= reach) return 0;
    const f = 1 - d / reach;
    const hl = Math.hypot(dx, dz);
    // outward and up: on the ground a burst pushes sideways and lifts
    let hx = dx;
    let hz = dz;
    if (hl < 0.006) {
      const a = rand() * 6.283;
      hx = Math.cos(a);
      hz = Math.sin(a);
    }
    const hn = Math.hypot(hx, hz) || 1;
    out.x = hx / hn;
    out.z = hz / hn;
    out.y = lift * (hl < 0.02 ? 1.4 : 0.9) + Math.max(0, dy) * 2.2 + 0.06;
    const n = Math.hypot(out.x, out.y, out.z);
    out.x /= n;
    out.y /= n;
    out.z /= n;
    const mf = clamp(Math.pow(REF_MASS / mass, 0.35), 0.16, 1.7);
    return Math.min(V_CAP * (mass > 0.1 ? 0.6 : 1), this.v0 * f * f * mf);
  }

  // the speed change a burst gives a loose thing (0 when it does not reach it); the direction is left in this._kick
  reachDv(r, R) {
    // cheap test first
    const rx = r.x - this.ex;
    const rz = r.z - this.ez;
    const reach = R + r.rad;
    if (rx * rx + rz * rz > reach * reach) return 0;
    if (Math.abs(r.y - this.ey) > reach) return 0;
    const kick = this._kick ?? (this._kick = new THREE.Vector3());
    const mass = r.type === T_PROP ? r.mass : Math.max(0.0005, r.mass || this.instMass(r));
    const dv = this.kick(r.x, r.y, r.z, r.rad, mass, R, kick);
    return dv < 0.02 ? 0 : dv;
  }

  // wake a loose thing the burst reaches and give it its kick
  push(r, R) {
    const dv = this.reachDv(r, R);
    if (dv === 0) return;
    if (!r.body && !this.wake(r)) return;
    this.impart(r, this._kick, dv, r.rad);
  }

  // the scattered ones: every one the burst reaches, up to the cap; past it the softest hits stay where they are
  pushInsts(R) {
    const cap = this.instCap ?? INST_CAP[this.app.quality?.tier] ?? INST_CAP.medium; // (instCap: a test hook)
    const cand = this._cand ?? (this._cand = []);
    cand.length = 0;
    for (const r of this.insts) {
      const dv = this.reachDv(r, R);
      if (dv === 0) continue;
      r.dv = dv;
      cand.push(r);
    }
    if (cand.length > cap) {
      cand.sort(byDv);
      cand.length = cap;
    }
    for (const r of cand) {
      // (the direction depends on where it is: ask again)
      const dv = this.reachDv(r, R);
      if (dv === 0) continue;
      if (!r.body && !this.wake(r)) continue;
      this.impart(r, this._kick, dv, r.rad);
    }
    cand.length = 0;
  }

  // (an estimate before the body exists: a lump is about 2.2 unit spheres' worth of its scale box, a thin shell about a third of that)
  instMass(r) {
    r.mass = r.dens * (r.mat === 'shell' || r.mat === 'starfish' ? 0.8 : 2.2) * r.sx * r.sy * r.sz;
    return r.mass;
  }

  // dv along dir, and a tumble away from the burst
  impart(r, dir, dv, size) {
    const b = r.body;
    b.linvel(LV);
    const tip = Math.min(45, ((0.55 + 0.6 * rand()) * dv) / Math.max(0.01, size));
    b.setLinvel({ x: LV.x + dir.x * dv, y: LV.y + dir.y * dv, z: LV.z + dir.z * dv }, true);
    b.angvel(AV);
    const hn = Math.hypot(dir.x, dir.z) || 1;
    b.setAngvel({ x: AV.x + (dir.z / hn) * tip + (rand() - 0.5) * tip * 0.5, y: AV.y + (rand() - 0.5) * tip, z: AV.z - (dir.x / hn) * tip + (rand() - 0.5) * tip * 0.5 }, true);
    r.calm = 0;
  }

  // ------------------------------------------------------------ bodies

  // A hull's points as a body needs them: scaled, and cut at the ground where the thing is sunk into it
  hullFor(hull, sx, sy, sz, px, py, pz, q, out) {
    const n = hull.length / 3;
    _q2.copy(q).invert();
    const W = this._hw ?? (this._hw = new Float32Array(3 * 64));
    let ng = 0;
    for (let i = 0; i < n; i++) {
      _v.set(hull[i * 3] * sx, hull[i * 3 + 1] * sy, hull[i * 3 + 2] * sz);
      const wv = _v.applyQuaternion(q);
      const wy = py + wv.y;
      const g = this.terrain.heightAt(px + wv.x, pz + wv.z) + 0.0004;
      if (wy < g + 0.0015) {
        // (a point on the ground: kept for the sag test below)
        if (ng < 64) {
          W[ng * 3] = px + wv.x;
          W[ng * 3 + 1] = wy < g ? g : wy;
          W[ng * 3 + 2] = pz + wv.z;
          ng++;
        }
        if (wy < g) wv.y += g - wy;
      }
      wv.applyQuaternion(_q2);
      out[i * 3] = wv.x;
      out[i * 3 + 1] = wv.y;
      out[i * 3 + 2] = wv.z;
    }
    // The hull's underside is flat between its points on the ground; over a mound the ground rises above that chord, and a body
    // starting there is stuck inside the ground (a starfish on a dune crest lost all its speed to it). How far, at the worst chord?
    let sag = 0;
    for (let a = 0; a < ng; a++) {
      for (let b = a + 1; b < ng; b++) {
        const mx = (W[a * 3] + W[b * 3]) / 2;
        const mz = (W[a * 3 + 2] + W[b * 3 + 2]) / 2;
        const d = this.terrain.heightAt(mx, mz) + 0.0004 - (W[a * 3 + 1] + W[b * 3 + 1]) / 2;
        if (d > sag) sag = d;
      }
    }
    // (and the physics ground is triangles, a few mm off heightAt on a steep noisy slope: twice the chord, and a margin)
    this.sag = Math.min(0.025, sag * 2 + 0.003);
    return out.subarray(0, n * 3);
  }

  wake(r) {
    const W = this.world;
    let desc = null;
    let body = null;
    if (r.type === T_PROP) {
      const o = r.obj;
      o.updateWorldMatrix(true, false);
      o.matrixWorld.decompose(_p, _q, _s);
      const pts = this.hullFor(r.hull, _s.x, _s.y, _s.z, _p.x, _p.y, _p.z, _q, new Float32Array(r.hull.length));
      desc = RAPIER.ColliderDesc.convexHull(pts);
      if (!desc) return false;
      desc.setMass(r.mass).setFriction(0.55).setRestitution(0.25).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.12);
      // (start it clear of the ground: see hullFor)
      body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(_p.x, _p.y + this.sag + 0.0005, _p.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }).setLinearDamping(0.1).setAngularDamping(0.7));
      r.parentIdentity = !o.parent || o.parent.matrixWorld.equals(_m.identity());
      if (!r.parentIdentity) r.inv.copy(o.parent.matrixWorld).invert();
      r.sx = _s.x;
      r.sy = _s.y;
      r.sz = _s.z;
    } else {
      _q.set(r.qx, r.qy, r.qz, r.qw);
      // What a scattered thing is to the physics. A flat-faced hull lying on the ground's 1 cm triangles is a dozen contact points and
      // costs 6 to 9 times a ball (measured), so the lumps are balls (they roll a little, then the stick rule holds them) and the
      // shells, which must lie flat, are boxes fitted to their shape
      const flat = r.mat === 'shell' || r.mat === 'starfish';
      let ang = 8; // (lumps are not round: they roll a little and stop, and on a slope they must not creep down for ever)
      let low = 0; // the collider's lowest point, relative to the body
      let flat0 = 0;
      if (!flat) {
        const br = (r.sx + r.sy + r.sz) * 0.24;
        desc = RAPIER.ColliderDesc.ball(br);
        low = -br;
      } else {
        const h = r.hull;
        let x0 = 9;
        let x1 = -9;
        let y0 = 9;
        let y1 = -9;
        let z0 = 9;
        let z1 = -9;
        for (let k = 0; k < h.length; k += 3) {
          x0 = Math.min(x0, h[k]);
          x1 = Math.max(x1, h[k]);
          y0 = Math.min(y0, h[k + 1]);
          y1 = Math.max(y1, h[k + 1]);
          z0 = Math.min(z0, h[k + 2]);
          z1 = Math.max(z1, h[k + 2]);
        }
        const hx = ((x1 - x0) / 2) * r.sx * 0.85;
        const hy = Math.max(0.0025, ((y1 - y0) / 2) * r.sy * 0.7);
        const hz = ((z1 - z0) / 2) * r.sz * 0.85;
        const ox = ((x0 + x1) / 2) * r.sx;
        const cy = ((y0 + y1) / 2) * r.sy;
        const oz = ((z0 + z1) / 2) * r.sz;
        desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(ox, cy, oz);
        low = cy - hy;
        ang = 3;
        // the underside is flat: clear of the ground under each corner too (a mound crest rises above the middle of it)
        for (let k = 0; k < 4; k++) {
          _v.set(ox + (k & 1 ? hx : -hx), low, oz + (k & 2 ? hz : -hz)).applyQuaternion(_q);
          flat0 = Math.max(flat0, this.terrain.heightAt(r.x + _v.x, r.z + _v.z) + 0.0004 - (r.y + _v.y));
        }
      }
      desc.setDensity(r.dens).setFriction(r.mu).setRestitution(r.e);
      // things sit part sunk in the ground: start them just clear of it (a few mm, while they are flying off)
      const lift = Math.max(0, flat0, this.terrain.heightAt(r.x, r.z) + 0.0004 - (r.y + low));
      r.y += lift;
      body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(r.x, r.y, r.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }).setLinearDamping(0.15).setAngularDamping(ang).setCcdEnabled(!flat && Math.max(r.sx, r.sy, r.sz) < BALL_BELOW));
      r.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    const col = W.createCollider(desc, body);
    r.body = body;
    r.col = col;
    r.calm = 0;
    r.awake = 0;
    if (r.type === T_PROP) {
      r.mass = body.mass();
      this.evMap.set(col.handle, r);
    } else r.mass = body.mass();
    this.act.push(r);
    return true;
  }

  dropBody(r) {
    if (!r.body) return;
    if (r.col) this.evMap.delete(r.col.handle);
    if (r.cols) for (const c of r.cols) this.evMap.delete(c.handle);
    this.world.removeRigidBody(r.body);
    r.body = null;
    r.col = null;
    r.cols = null;
  }

  // ------------------------------------------------------------ frame

  step(dt) {
    if (!this.ready) return;
    if (this.sways.length) this.stepSways(dt);
    if (this.chunks.job) this.chunks.pump(Math.ceil(this.chunks.job.n / 3));
    if (this.chunks.live) this.chunks.update(dt);
    if (!this.act.length || dt <= 0) return;
    const t0 = performance.now();
    this.time += dt;
    this.syncTanks();
    const n = Math.min(SUB_MAX, Math.max(1, Math.ceil(dt / SUB_DT)));
    const h = Math.min(dt / n, 1 / 40);
    this.world.timestep = h;
    for (let i = 0; i < n; i++) {
      this.world.step(this.queue);
      this.stepCount++;
      this.queue.drainContactForceEvents(this._onForce);
    }
    this.sync(dt);
    this.flushSounds();
    const ms = performance.now() - t0;
    if (this.trace) this.trace.push(+ms.toFixed(2));
    this.stats.ms = ms;
    this.stats.awake = this.act.length;
    this.stats.steps += n;
    if (ms > this.stats.peak) this.stats.peak = ms;
  }

  // poses back to the scene; settled bodies go back to being scenery
  sync(dt) {
    const act = this.act;
    for (let i = act.length - 1; i >= 0; i--) {
      const r = act[i];
      const b = r.body;
      b.translation(RV);
      b.rotation(RQ);
      r.awake += dt;
      switch (r.type) {
        case T_CHUNK:
          this.chunks.sync(r, dt);
          break;
        case T_PROP: {
          r.x = RV.x;
          r.y = RV.y + r.info.box[4] * 0.5 * r.sy;
          r.z = RV.z;
          const o = r.obj;
          if (r.parentIdentity) {
            o.position.set(RV.x, RV.y, RV.z);
            o.quaternion.set(RQ.x, RQ.y, RQ.z, RQ.w);
          } else {
            _m.compose(_p.set(RV.x, RV.y, RV.z), _q.set(RQ.x, RQ.y, RQ.z, RQ.w), _s.set(r.sx, r.sy, r.sz));
            _m.premultiply(r.inv).decompose(o.position, o.quaternion, _s);
          }
          o.matrixWorldNeedsUpdate = true;
          this.calmCheck(r, b, dt);
          break;
        }
        case T_INST:
          this.writeInst(r);
          this.calmCheck(r, b, dt, RV.y - this.terrain.heightAt(RV.x, RV.z) < r.rad * 0.95);
          break;
        case T_BLOCK:
        case T_STAND: {
          r.x = RV.x;
          r.y = r.type === T_STAND ? RV.y + 0.09 : RV.y;
          r.z = RV.z;
          const o = r.obj;
          o.position.set(RV.x, RV.y, RV.z);
          o.quaternion.set(RQ.x, RQ.y, RQ.z, RQ.w);
          this.calmCheck(r, b, dt);
          break;
        }
        default:
      }
    }
    if (this.towers.length) this.stepTowers(dt);
  }

  // Calm for long enough (or asleep, or out too long): done. Blocks and the stand leave that to their tower.
  // stick: on the ground, a slow small thing stays where it is (Rapier has no rolling resistance, so a lump would creep down a slope for ever)
  calmCheck(r, b, dt, stick = false) {
    b.linvel(LV);
    b.angvel(AV);
    const v2 = LV.x * LV.x + LV.y * LV.y + LV.z * LV.z;
    const w2 = AV.x * AV.x + AV.y * AV.y + AV.z * AV.z;
    if ((v2 < CALM_V2 && w2 < CALM_W2) || (stick && v2 < STICK_V2 * 0.5)) r.calm += dt;
    else r.calm = 0;
    if (r.grp) return;
    if (r.calm > CALM_TIME || b.isSleeping() || r.awake > MAX_AWAKE) this.settle(r);
  }

  settle(r) {
    if (!r.body) return;
    const b = r.body;
    b.translation(RV);
    b.rotation(RQ);
    if (r.type === T_INST) {
      r.x = RV.x;
      r.y = RV.y;
      r.z = RV.z;
      r.qx = RQ.x;
      r.qy = RQ.y;
      r.qz = RQ.z;
      r.qw = RQ.w;
      this.writeInst(r);
    }
    this.dropBody(r);
    const i = this.act.indexOf(r);
    if (i >= 0) {
      this.act[i] = this.act[this.act.length - 1];
      this.act.pop();
    }
  }

  writeInst(r) {
    _m.compose(_p.set(RV.x, RV.y, RV.z), _q.set(RQ.x, RQ.y, RQ.z, RQ.w), _s.set(r.sx, r.sy, r.sz));
    _m.toArray(r.mesh.instanceMatrix.array, r.i * 16);
    r.mesh.instanceMatrix.needsUpdate = true;
    r.x = RV.x;
    r.y = RV.y;
    r.z = RV.z;
  }

  // ------------------------------------------------------------ sound (aggregated, once per frame)

  // A knock is a spike over the steady force a body rests with (a block under four others always presses on the one below)
  forceEvent(ev) {
    const F = ev.totalForceMagnitude();
    const r = this.evMap.get(ev.collider1()) ?? this.evMap.get(ev.collider2());
    if (!r) return;
    const fresh = (r.fStep ?? -9) < this.stepCount - 1;
    const base = fresh ? 0 : r.fBase;
    r.fBase = fresh ? F : base * 0.6 + F * 0.4;
    r.fStep = this.stepCount;
    const s = Math.min(1, Math.sqrt(Math.max(0, F - base - 0.1)) / 2.6);
    const m = r.mat ?? 'wood';
    if (s > this.knock[m]) {
      this.knock[m] = s;
      this.knockX[m] = r.x ?? RV.x;
    }
  }

  flushSounds() {
    const a = this.app.audio;
    const now = this.time;
    if (now - this.knockAt > 0.06) {
      let any = false;
      for (const m in this.knock) {
        const s = this.knock[m];
        if (s > 0.06) {
          a?.knock?.(KNOCK_SOUND[m] ?? m, s, this.app.pan(this.knockX[m]));
          any = true;
        }
        this.knock[m] = 0;
      }
      if (any) this.knockAt = now;
    } else for (const m in this.knock) this.knock[m] = 0;
    if (this.patterN && now - this.patterAt > 0.09) {
      // (audio takes the landing speed as 0..1: 2 m/s is a hard landing for a chunk)
      a?.patter?.(this.patterN, Math.min(1, this.patterV / 2), this.app.pan(this.patterX), this.app.world.ground);
      this.patterN = 0;
      this.patterV = 0;
      this.patterAt = now;
    }
  }

  // ------------------------------------------------------------ targets

  blastTargets(e, R) {
    const T = this.app.targets;
    if (!T) return;
    for (const it of T.items) {
      if (it.kind === 'balloon') {
        if (it.alive) this.kickSway(it, R, 0.7, 0.9);
      } else if (it.kind === 'bonus') {
        if (it.alive) this.kickSway(it, R, 0.5, 1.2);
      } else if (it.kind === 'blocks') {
        this.blastTower(it, e, R);
      } else if (it.kind === 'bullseye') {
        this.blastStand(it, e, R);
      }
    }
  }

  // ---- balloons and the bonus star: a pendulum on a string / a spring, added on top of what targets.js draws

  kickSway(it, R, vmax, lift) {
    const o = it.object.position;
    const py = it.kind === 'balloon' ? o.y + it.height : o.y + it.star.position.y;
    const dx = o.x - this.ex;
    const dy = py - this.ey;
    const dz = o.z - this.ez;
    const d = Math.hypot(dx, dy, dz);
    const reach = R + 0.05;
    if (d >= reach) return;
    const f = 1 - d / reach;
    const dv = Math.min(vmax, this.v0 * f * f * 1.6);
    if (dv < 0.02) return;
    const hn = Math.hypot(dx, dz) || 1;
    let sw = it._sw;
    if (!sw) {
      sw = it._sw = { it, on: false, ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, L: 0, calm: 0, base: null, home: 0, y0: 0 };
    }
    if (!sw.on) {
      sw.on = true;
      sw.ox = sw.oy = sw.oz = 0;
      sw.vx = sw.vy = sw.vz = 0;
      sw.calm = 0;
      if (it.kind === 'balloon') {
        sw.L = it.height;
        if (!sw.base) sw.base = Float32Array.from(it.string.geometry.attributes.position.array);
        it.string.frustumCulled = false;
      } else sw.y0 = o.y;
      this.sways.push(sw);
    }
    // outward, and a little up
    sw.vx += (dx / hn) * dv;
    sw.vz += (dz / hn) * dv;
    sw.vy += (Math.max(0, dy) / Math.max(d, 0.01) + 0.25) * dv * lift * 0.5;
  }

  stepSways(dt) {
    const n = Math.max(1, Math.ceil(dt / SUB_DT));
    const h = dt > 0 ? Math.min(dt / n, 1 / 40) : 0;
    for (let i = this.sways.length - 1; i >= 0; i--) {
      const sw = this.sways[i];
      const it = sw.it;
      if (!it.alive || !this.app.targets.items.includes(it)) {
        this.endSway(sw, i);
        continue;
      }
      if (h === 0) {
        this.applySway(sw);
        continue;
      }
      if (it.kind === 'balloon') {
        // an upside-down pendulum on a taut string: the balloon pulls up, the string holds it on a sphere
        const L = sw.L;
        const gEff = 5.4;
        const damp = Math.exp(-1.25 * h);
        for (let k = 0; k < n; k++) {
          sw.vy += gEff * h;
          sw.vx *= damp;
          sw.vy *= damp;
          sw.vz *= damp;
          sw.ox += sw.vx * h;
          sw.oy += sw.vy * h;
          sw.oz += sw.vz * h;
          const py = L + sw.oy;
          const len = Math.hypot(sw.ox, py, sw.oz);
          const kk = L / len;
          sw.ox *= kk;
          sw.oz *= kk;
          sw.oy = py * kk - L;
          const nx = sw.ox / L;
          const ny = (L + sw.oy) / L;
          const nz = sw.oz / L;
          const vn = sw.vx * nx + sw.vy * ny + sw.vz * nz;
          sw.vx -= nx * vn;
          sw.vy -= ny * vn;
          sw.vz -= nz * vn;
        }
      } else {
        // the bonus star: a soft spring back to where it hangs
        const w2 = 4.6 * 4.6;
        const damp = Math.exp(-1.1 * h);
        for (let k = 0; k < n; k++) {
          sw.vx = (sw.vx - w2 * sw.ox * h) * damp;
          sw.vy = (sw.vy - w2 * sw.oy * h) * damp;
          sw.vz = (sw.vz - w2 * sw.oz * h) * damp;
          sw.ox += sw.vx * h;
          sw.oy += sw.vy * h;
          sw.oz += sw.vz * h;
        }
      }
      const off2 = sw.ox * sw.ox + sw.oy * sw.oy + sw.oz * sw.oz;
      const v2 = sw.vx * sw.vx + sw.vy * sw.vy + sw.vz * sw.vz;
      if (off2 < 4e-8 && v2 < 4e-6) sw.calm += dt;
      else sw.calm = 0;
      if (sw.calm > 0.4) {
        this.endSway(sw, i);
        continue;
      }
      this.applySway(sw);
    }
  }

  // targets.js has just drawn the bob; put the displacement on top of it
  applySway(sw) {
    const it = sw.it;
    if (it.kind === 'balloon') {
      const b = it.balloon;
      b.position.x += sw.ox;
      b.position.y += sw.oy;
      b.position.z = sw.oz;
      b.rotation.z += -Math.asin(clamp(sw.ox / sw.L, -1, 1));
      b.rotation.x = Math.asin(clamp(sw.oz / sw.L, -1, 1));
      const s = it.shape;
      s.x = it.x + sw.ox;
      s.y += sw.oy;
      s.z = sw.oz;
      // the string: from the peg to the knot, following the balloon
      const pos = it.string.geometry.attributes.position;
      const a = pos.array;
      const base = sw.base;
      const dx = b.position.x;
      const dy = b.position.y - it.height;
      const dz = b.position.z;
      for (let k = 0; k <= 12; k++) {
        const t = 1 - k / 12;
        a[k * 3] = base[k * 3] + dx * t;
        a[k * 3 + 1] = base[k * 3 + 1] + dy * t;
        a[k * 3 + 2] = base[k * 3 + 2] + dz * t;
      }
      pos.needsUpdate = true;
    } else {
      const o = it.object.position;
      o.x = it.x + sw.ox;
      o.y = sw.y0 + sw.oy;
      o.z = sw.oz;
      it.shape.x = o.x;
      it.shape.y = o.y + it.star.position.y;
      it.shape.z = o.z;
    }
  }

  endSway(sw, i) {
    const it = sw.it;
    sw.on = false;
    this.sways[i] = this.sways[this.sways.length - 1];
    this.sways.pop();
    if (it.kind === 'balloon') {
      if (sw.base) {
        const a = it.string.geometry.attributes.position;
        a.array.set(sw.base);
        a.needsUpdate = true;
      }
      it.balloon.rotation.x = 0;
      it.balloon.position.z = 0;
      it.shape.x = it.x;
      it.shape.z = 0;
    } else {
      it.object.position.set(it.x, sw.y0, 0);
      it.shape.x = it.x;
      it.shape.z = 0;
      it.shape.y = sw.y0 + it.star.position.y;
    }
  }

  // ---- block towers

  blastTower(it, e, R) {
    if (!it.blocks?.length) return;
    const ph = it._ph;
    const T = this.app.targets;
    // where the blocks are now
    const first = it.blocks[0];
    const inTower = first.parent === it.object;
    const ox = inTower ? it.object.position.x : 0;
    const oy = inTower ? it.object.position.y : 0;
    const oz = inTower ? it.object.position.z : 0;
    // direct hit: targets.js has just tipped it over and set its blocks tumbling
    let hitNow = false;
    if (!it.alive) {
      for (const pc of T.pieces) {
        if (it.blocks.includes(pc.mesh) && pc.rest <= 1) {
          pc.rest = 99; // targets.js stops its own tumble: from here the blocks are ours
          hitNow = true;
        }
      }
    }
    let reach = false;
    let dvMax = 0;
    const kick = this._kick ?? (this._kick = new THREE.Vector3());
    for (const b of it.blocks) {
      const dv = this.kick(b.position.x + ox, b.position.y + oy, b.position.z + oz, 0.02, 0.016, R, kick, 0.6);
      if (dv > dvMax) dvMax = dv;
    }
    reach = dvMax > 0.12;
    if (!hitNow && !reach) return;
    if (!ph || !ph.active) this.wakeTower(it, hitNow);
    const p = it._ph;
    if (!p?.active) return;
    // hit height: the block the ball met gets the ball's momentum
    const bx = e.x;
    const by = e.y;
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < p.recs.length; i++) {
      const r = p.recs[i];
      const d = Math.hypot(r.x - bx, r.y - by);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const direct = hitNow || bd < 0.03;
    for (let i = 0; i < p.recs.length; i++) {
      const r = p.recs[i];
      const dv = this.kick(r.x, r.y, r.z, 0.02, 0.016, R, kick, 0.6);
      if (dv > 0.01) this.impart(r, kick, dv, 0.02);
      if (direct) {
        const w = Math.exp(-Math.pow((i - bi) / 1.3, 2));
        const sp = Math.hypot(e.vx, e.vy);
        if (sp > 0.01) {
          r.body.linvel(LV);
          const k = 0.55 * w;
          r.body.setLinvel({ x: LV.x + (e.vx / sp) * Math.min(sp, 3) * k, y: LV.y + Math.max(0, (e.vy / sp) * Math.min(sp, 3) * k * 0.4) + 0.2 * w, z: LV.z + (rand() - 0.5) * 0.25 * w }, true);
        }
      }
    }
    p.hit = p.hit || direct;
  }

  wakeTower(it, hitNow) {
    const T = this.app.targets;
    const recs = [];
    const W = this.world;
    // take the blocks out of the tower group, keeping where they are
    it.object.updateWorldMatrix(true, true);
    for (let i = 0; i < it.blocks.length; i++) {
      const m = it.blocks[i];
      if (m.parent !== T.group) {
        T.group.attach(m);
        this.claimed.push(m);
      }
    }
    const ph = it._ph ?? (it._ph = { it, recs: [], active: false, calm: 0, t: 0, hit: false, home: null, dead: false });
    if (!ph.home) ph.home = it.blocks.map((m) => ({ x: m.position.x, y: m.position.y, z: m.position.z }));
    for (const m of it.blocks) {
      const r = {
        type: T_BLOCK,
        obj: m,
        grp: ph,
        mat: 'wood',
        x: m.position.x,
        y: m.position.y,
        z: m.position.z,
        rad: 0.026,
        mass: 0.016,
        body: null,
        col: null,
        calm: 0,
        awake: 0,
      };
      const body = W.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(m.position.x, m.position.y, m.position.z).setRotation({ x: m.quaternion.x, y: m.quaternion.y, z: m.quaternion.z, w: m.quaternion.w }).setLinearDamping(0.05).setAngularDamping(0.4).setCcdEnabled(true),
      );
      r.col = W.createCollider(
        RAPIER.ColliderDesc.cuboid(0.0148, 0.0148, 0.0148).setDensity(600).setFriction(0.55).setRestitution(0.2).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.12),
        body,
      );
      r.body = body;
      this.evMap.set(r.col.handle, r);
      recs.push(r);
      this.act.push(r);
    }
    ph.recs = recs;
    ph.active = true;
    ph.calm = 0;
    ph.t = 0;
    if (!this.towers.includes(ph)) this.towers.push(ph);
  }

  blastStand(it, e, R) {
    const face = it._face ?? (it._face = it.object.children[0]);
    if (!face) return;
    const ph = it._ph;
    const wp = face.getWorldPosition(_p);
    const cy = wp.y + 0.09;
    const kick = this._kick ?? (this._kick = new THREE.Vector3());
    const dv = this.kick(wp.x, cy, wp.z, 0.05, 0.05, R, kick, 0.5);
    const direct = Math.hypot(wp.x - e.x, cy - e.y, wp.z - e.z) < 0.12 && !e.crater;
    if (!direct && dv < 0.1) return;
    if (!ph || !ph.active) this.wakeStand(it);
    const p = it._ph;
    if (!p?.active) return;
    const r = p.recs[0];
    this.impart(r, kick, Math.max(dv, 0.05), 0.05);
    if (direct) {
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > 0.01) {
        r.body.linvel(LV);
        r.body.setLinvel({ x: LV.x + (e.vx / sp) * Math.min(sp, 3) * 0.35, y: LV.y + 0.15, z: LV.z + (rand() - 0.5) * 0.15 }, true);
        r.body.angvel(AV);
        r.body.setAngvel({ x: AV.x + (rand() - 0.5) * 2, y: AV.y, z: AV.z - Math.sign(e.vx) * 3 }, true);
      }
      p.hit = true;
    }
  }

  wakeStand(it) {
    const T = this.app.targets;
    const face = it._face ?? (it._face = it.object.children[0]);
    if (face.parent !== T.group) {
      T.group.attach(face);
      this.claimed.push(face);
    }
    it.wobble = 0;
    const W = this.world;
    face.updateWorldMatrix(true, false);
    face.matrixWorld.decompose(_p, _q, _s);
    const ph = it._ph ?? (it._ph = { it, recs: [], active: false, calm: 0, t: 0, hit: false, home: { x: _p.x, y: _p.y, z: _p.z }, dead: false });
    const r = { type: T_STAND, obj: face, grp: ph, mat: 'wood', x: _p.x, y: _p.y + 0.09, z: _p.z, rad: 0.06, mass: 0.05, body: null, cols: [], calm: 0, awake: 0 };
    const body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(_p.x, _p.y, _p.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }).setLinearDamping(0.05).setAngularDamping(0.5).setCcdEnabled(true));
    const ev = RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS;
    // the board, on its edge across the lane; two legs; and a base plate the model hides (or it could never stand)
    _q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    r.cols.push(W.createCollider(RAPIER.ColliderDesc.cylinder(0.004, 0.055).setTranslation(0, 0.1, 0).setRotation({ x: _q2.x, y: _q2.y, z: _q2.z, w: _q2.w }).setDensity(600).setFriction(0.5).setRestitution(0.25).setActiveEvents(ev).setContactForceEventThreshold(0.12), body));
    for (const sz of [-1, 1]) {
      _q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), sz * 0.25);
      r.cols.push(W.createCollider(RAPIER.ColliderDesc.cylinder(0.045, 0.003).setTranslation(0.012, 0.045, sz * 0.03).setRotation({ x: _q2.x, y: _q2.y, z: _q2.z, w: _q2.w }).setDensity(600).setFriction(0.5).setRestitution(0.2), body));
    }
    r.cols.push(W.createCollider(RAPIER.ColliderDesc.cuboid(0.034, 0.003, 0.042).setTranslation(0, 0.003, 0).setDensity(250).setFriction(0.6).setRestitution(0.1), body));
    r.body = body;
    for (const c of r.cols) this.evMap.set(c.handle, r);
    ph.recs = [r];
    ph.active = true;
    ph.calm = 0;
    ph.t = 0;
    this.act.push(r);
    if (!this.towers.includes(ph)) this.towers.push(ph);
  }

  // towers and stands settle as a whole; one is judged every step, so a knocked-down one scores and stops being a target at once
  stepTowers(dt) {
    for (let i = this.towers.length - 1; i >= 0; i--) {
      const ph = this.towers[i];
      ph.t += dt;
      this.judge(ph);
      let calm = true;
      for (const r of ph.recs) if (r.calm < CALM_TIME || r.awake < 0.3) calm = false;
      if (!calm && ph.t < MAX_AWAKE) continue;
      // put the bodies down where they are
      for (const r of ph.recs) {
        if (!r.body) continue;
        r.body.translation(RV);
        r.body.rotation(RQ);
        r.obj.position.set(RV.x, RV.y, RV.z);
        r.obj.quaternion.set(RQ.x, RQ.y, RQ.z, RQ.w);
        this.dropBody(r);
        const k = this.act.indexOf(r);
        if (k >= 0) {
          this.act[k] = this.act[this.act.length - 1];
          this.act.pop();
        }
      }
      ph.active = false;
      this.towers[i] = this.towers[this.towers.length - 1];
      this.towers.pop();
    }
  }

  // Did it go over? A target that has been knocked down cannot be hit any more; one the splash toppled counts as a light hit.
  judge(ph) {
    const it = ph.it;
    const T = this.app.targets;
    if (!T.items.includes(it)) return;
    let down = false;
    if (it.kind === 'blocks') {
      for (let i = 0; i < ph.recs.length; i++) {
        const r = ph.recs[i];
        const h = ph.home[i];
        const q = r.obj.quaternion;
        _v.set(0, 1, 0).applyQuaternion(q);
        if (Math.hypot(r.x - h.x, r.z - h.z) > 0.014 || Math.abs(r.y - h.y) > 0.012 || _v.y < 0.985) down = true;
      }
    } else {
      const r = ph.recs[0];
      const h = ph.home;
      _v.set(0, 1, 0).applyQuaternion(r.obj.quaternion);
      down = _v.y < 0.9 || Math.hypot(r.obj.position.x - h.x, r.obj.position.z - h.z) > 0.06;
    }
    if (!down) return;
    if (it.kind === 'blocks') {
      it.shape.hy = 0.001;
      it.shape.y = -9;
    } else it.shape.y = -9;
    if (it.alive) {
      it.alive = false;
      const pts = it.kind === 'blocks' ? Math.round((50 + ph.recs.length * 10) * 0.5) : 15;
      T.audio?.target?.(it.kind === 'blocks' ? 'blocks' : 'bullseye', 0);
      T.award(it, pts, ph.recs[0].x, ph.recs[0].y + 0.06);
    }
  }

  // targets.clear(): the blocks and stands we hold are going away
  releaseTargets() {
    for (const ph of this.towers) {
      for (const r of ph.recs) {
        if (r.body) {
          this.dropBody(r);
          const k = this.act.indexOf(r);
          if (k >= 0) {
            this.act[k] = this.act[this.act.length - 1];
            this.act.pop();
          }
        }
      }
    }
    this.towers.length = 0;
    for (const m of this.claimed) m.removeFromParent();
    this.claimed.length = 0;
    this.sways.length = 0;
  }

}

// ---------------------------------------------------------------------------------------------- debris chunks

class Chunks {
  constructor(phys) {
    this.P = phys;
    this.meshes = [null, null];
    this.slots = [];
    this.pool = [[], []]; // per mesh, by instance index
    this.free = [[], []];
    this.hi = [0, 0];
    this.dirty = [false, false];
    this.live = 0;
    this.used = 0;
    this.cap = 0;
    this.kind = CHUNKS.grass;
    this.spare = [];
    this.job = null;
  }

  async setStage(stage, terrain, quality) {
    this.dispose();
    const P = this.P;
    const gk = stage.ground.kind in CHUNKS ? stage.ground.kind : 'grass';
    const K = (this.kind = CHUNKS[gk]);
    this.gk = gk;
    this.cap = CAP[quality.tier] ?? 110;
    const g = stage.ground;
    const names = { a: K.a === 'dug' ? g.dug : g.base, b: K.b === 'dug' ? g.dug : g.base };
    const tints = { a: K.a === 'dug' ? g.dugTint ?? 0xffffff : g.baseTint ?? 0xffffff, b: K.b === 'dug' ? g.dugTint ?? 0xffffff : g.baseTint ?? 0xffffff };
    const capA = Math.ceil(this.cap * K.mixA * 1.15);
    const capB = this.cap - capA + Math.ceil(this.cap * 0.15);
    const sets = await Promise.all([loadPBR(names.a).catch(() => null), loadPBR(names.b).catch(() => null)]);
    for (let k = 0; k < 2; k++) {
      const set = sets[k];
      const cap = k ? capB : capA;
      const geo = chunkGeometry(11 + k * 7, K.round);
      geo.setAttribute('aUv', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2));
      const tint = _c.set(k ? tints.b : tints.a).clone();
      const mat = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 1,
        metalness: 0,
        vertexColors: true,
        map: set?.map ?? null,
        normalMap: set?.normalMap ?? null,
        roughnessMap: set?.ormMap ?? null,
      });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 aUv;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv += aUv;\n#endif\n#ifdef USE_NORMALMAP\nvNormalMapUv += aUv;\n#endif\n#ifdef USE_ROUGHNESSMAP\nvRoughnessMapUv += aUv;\n#endif');
      };
      mat.customProgramCacheKey = () => `tt-chunk-${!!set}`;
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.setColorAt(0, _c.set(0xffffff)); // (allocates instanceColor now: a later first use would compile a second program)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `chunks-${gk}-${k ? 'b' : 'a'}`;
      mesh.userData.tint = k ? K.tintB : K.tintA;
      P.group.add(mesh);
      this.meshes[k] = mesh;
      this.free[k] = [];
      this.pool[k] = [];
      for (let i = cap - 1; i >= 0; i--) this.free[k].push(i);
      this.hi[k] = 0;
      for (let i = 0; i < cap; i++) {
        const sl = { kind: k, i, state: F_FREE, type: T_CHUNK, body: null, col: null, r: 0.004, age: 0, life: 10, sink: 0, sx: 1, sy: 1, sz: 1, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, calm: 0, awake: 0, vy: 0, mass: 0, mat: 'sand' };
        this.pool[k].push(sl);
        this.slots.push(sl);
      }
    }
    this.live = 0;
    this.used = 0;
  }

  clear() {
    const P = this.P;
    this.job = null;
    for (const s of this.slots) {
      if (s.body) {
        P.dropBody(s);
        const i = P.act.indexOf(s);
        if (i >= 0) {
          P.act[i] = P.act[P.act.length - 1];
          P.act.pop();
        }
      }
      if (s.state !== F_FREE) this.release(s);
    }
    this.live = 0;
    this.used = 0;
  }

  dispose() {
    this.clear();
    for (let k = 0; k < 2; k++) {
      const m = this.meshes[k];
      if (!m) continue;
      this.P.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      m.dispose();
      this.meshes[k] = null;
    }
    this.slots.length = 0;
    this.pool = [[], []];
  }

  // a free slot of this kind, or the oldest one in use
  take(k) {
    let i = this.free[k].pop();
    if (i === undefined) {
      let old = null;
      for (const s of this.slots) if (s.kind === k && s.state !== F_FREE && (!old || s.age > old.age)) old = s;
      if (!old) return null;
      const P = this.P;
      if (old.body) {
        P.dropBody(old);
        const j = P.act.indexOf(old);
        if (j >= 0) {
          P.act[j] = P.act[P.act.length - 1];
          P.act.pop();
        }
      }
      this.used--;
      return old;
    }
    return this.pool[k][i];
  }

  release(s) {
    s.state = F_FREE;
    const m = this.meshes[s.kind];
    m.instanceMatrix.array.fill(0, s.i * 16, s.i * 16 + 16);
    m.instanceMatrix.needsUpdate = true;
    this.free[s.kind].push(s.i);
    this.used--;
    let hi = this.hi[s.kind];
    if (s.i === hi - 1) {
      // shrink the drawn range
      const mine = this.pool[s.kind];
      while (hi > 0 && mine[hi - 1].state === F_FREE) hi--;
      this.hi[s.kind] = hi;
      m.count = hi;
    }
  }

  // ---- burst

  // resting chunks the burst reaches are woken and thrown again
  blast(e, R) {
    if (!this.used) return;
    const P = this.P;
    const kick = P._kick ?? (P._kick = new THREE.Vector3());
    for (const s of this.slots) {
      if (s.state !== F_REST && s.state !== F_SINK) continue;
      const dv = P.kick(s.x, s.y, s.z, s.r, 0.0004, R, kick, 1);
      if (dv < 0.05) continue;
      // the ground may have moved from under it: the tile rebuild has already happened
      this.wakeSlot(s);
      P.impart(s, kick, dv, s.r);
    }
  }

  wakeSlot(s) {
    const P = this.P;
    const K = this.kind;
    s.state = F_FLY;
    s.sink = 0;
    const body = P.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(s.x, s.y, s.z).setRotation({ x: s.qx, y: s.qy, z: s.qz, w: s.qw }).setLinearDamping(K.lin).setAngularDamping(K.ang).setCcdEnabled(P.opts.ccd));
    s.col = P.world.createCollider(RAPIER.ColliderDesc.ball(s.r * 0.88).setDensity(K.dens[s.kind]).setFriction(K.mu).setRestitution(K.e), body);
    s.body = body;
    s.calm = 0;
    s.awake = 0;
    s.mass = body.mass();
    P.act.push(s);
  }

  // A burst throws its chunks over three frames (a body costs about 40 us to make): the first ones at once, the rest on the next steps
  spawn(e) {
    const c = e.crater;
    if (!c) return;
    const P = this.P;
    const K = this.kind;
    const q = P.app.quality;
    if (this.job) this.pump(999);
    const mult = 0.55 + 0.45 * (q.particles ?? 1);
    let n = Math.round((10 + 24 * e.power) * (e.great ? 1.2 : 1) * Math.pow(e.scale, 0.6) * mult * K.count);
    n = Math.min(n, this.cap);
    this.job = {
      cx: c.x,
      cz: c.z,
      cr: c.r,
      n,
      made: 0,
      v0: (0.85 + 1.35 * e.power) * (e.great ? 1.12 : 1) * Math.pow(e.scale, 0.4),
      scale: e.scale,
      // ejecta fly mostly back up the way the ball came
      up: P.eDirX > 0 ? Math.PI : 0,
    };
    this.pump(Math.ceil(n / 3));
  }

  pump(max) {
    const j = this.job;
    if (!j) return;
    const m = Math.min(max, j.n - j.made);
    for (let k = 0; k < m; k++) this.throwOne(j);
    j.made += m;
    if (j.made >= j.n) this.job = null;
    this.live = this.used;
  }

  throwOne(j) {
    const P = this.P;
    const K = this.kind;
    const kind = rand() < K.mixA ? 0 : 1;
    const s = this.take(kind);
    if (!s) return;
    // size: many small, few large; a great hit throws more, not bigger
    const u = rand();
    const d = (K.size[0] + (K.size[1] - K.size[0]) * u * u) * 0.001 * (0.9 + 0.2 * Math.sqrt(j.scale));
    s.r = d / 2;
    let a;
    do a = rand() * 6.2832;
    while (rand() * 1.7 > 1 + 0.7 * Math.cos(a - j.up));
    const rho = j.cr * (0.15 + 0.7 * rand());
    const px = j.cx + Math.cos(a) * rho;
    const pz = j.cz + Math.sin(a) * rho;
    const gy = P.terrain.heightAt(px, pz);
    // out along the crater's walls: steeper the nearer the middle
    const phi = (58 + 22 * (1 - rho / j.cr) + (rand() - 0.5) * 22) * (Math.PI / 180);
    const sp = j.v0 * (0.3 + 0.7 * Math.pow(rand(), 0.7)) * (1.18 - 0.5 * u);
    const aj = a + (rand() - 0.5) * 0.7;
    const vx = Math.cos(aj) * Math.cos(phi) * sp;
    const vy = Math.sin(phi) * sp;
    const vz = Math.sin(aj) * Math.cos(phi) * sp;
    s.x = px;
    s.y = gy + s.r * 0.95;
    s.z = pz;
    s.sx = s.r * (0.85 + rand() * 0.4);
    s.sy = s.r * (0.7 + rand() * 0.4);
    s.sz = s.r * (0.85 + rand() * 0.4);
    _q.setFromEuler(_e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28));
    s.qx = _q.x;
    s.qy = _q.y;
    s.qz = _q.z;
    s.qw = _q.w;
    s.age = 0;
    s.life = between(CHUNK_LIFE[0], CHUNK_LIFE[1]);
    s.state = F_FLY;
    s.sink = 0;
    s.quick = false;
    s.vy = 0;
    this.used++;
    this.setInstance(s, 1);
    const body = P.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(s.x, s.y, s.z).setRotation({ x: s.qx, y: s.qy, z: s.qz, w: s.qw }).setLinvel(vx, vy, vz).setAngvel({ x: (rand() - 0.5) * 60, y: (rand() - 0.5) * 60, z: (rand() - 0.5) * 60 }).setLinearDamping(K.lin).setAngularDamping(K.ang).setCcdEnabled(P.opts.ccd),
    );
    s.col = P.world.createCollider(RAPIER.ColliderDesc.ball(s.r * 0.88).setDensity(K.dens[s.kind]).setFriction(K.mu).setRestitution(K.e), body);
    s.body = body;
    s.calm = 0;
    s.awake = 0;
    s.mass = body.mass();
    P.act.push(s);
  }

  // (re)write a chunk's instance: matrix, colour, texture offset
  setInstance(s, fresh) {
    const m = this.meshes[s.kind];
    if (fresh) {
      const t = m.userData.tint;
      const v = t * (0.82 + rand() * 0.34);
      _c.setRGB(v * (0.97 + rand() * 0.06), v, v * (0.95 + rand() * 0.08));
      m.setColorAt(s.i, _c);
      m.instanceColor.needsUpdate = true;
      const uv = m.geometry.attributes.aUv;
      uv.array[s.i * 2] = rand();
      uv.array[s.i * 2 + 1] = rand();
      uv.needsUpdate = true;
      if (s.i >= this.hi[s.kind]) {
        this.hi[s.kind] = s.i + 1;
        m.count = s.i + 1;
      }
    }
    _m.compose(_p.set(s.x, s.y, s.z), _q.set(s.qx, s.qy, s.qz, s.qw), _s.set(s.sx, s.sy, s.sz));
    _m.toArray(m.instanceMatrix.array, s.i * 16);
    m.instanceMatrix.needsUpdate = true;
  }

  // ---- frame

  // a flying chunk after a step (called from Physics.sync with RV / RQ read)
  sync(s, dt) {
    const P = this.P;
    let y = RV.y;
    // Nothing thrown may end up in the ground: a chunk that is under the terrain is put back on it
    const g = P.terrain.heightAt(RV.x, RV.z);
    if (y < g + s.r * 0.4) {
      y = g + s.r * 0.95;
      s.body.setTranslation({ x: RV.x, y, z: RV.z }, true);
      s.body.linvel(LV);
      if (LV.y < 0) s.body.setLinvel({ x: LV.x, y: 0.02, z: LV.z }, true);
    }
    s.body.linvel(LV);
    // a bounce is a small sound: aggregated by the caller's sound pass
    if (s.vy < -0.35 && LV.y > s.vy + 0.15) {
      P.patterN++;
      if (-s.vy > P.patterV) P.patterV = -s.vy;
      P.patterX = RV.x;
    }
    s.vy = LV.y;
    s.x = RV.x;
    s.y = y;
    s.z = RV.z;
    s.qx = RQ.x;
    s.qy = RQ.y;
    s.qz = RQ.z;
    s.qw = RQ.w;
    this.setInstance(s, 0);
    const v2 = LV.x * LV.x + LV.y * LV.y + LV.z * LV.z;
    // Rapier has no rolling resistance: a ball creeps down any slope for ever. A clod that lands slowly stays where it fell.
    const grounded = y - g < s.r * 1.4;
    if (grounded && v2 < STICK_V2) s.calm += CALM_TIME;
    else s.calm = 0;
    // out of the play area, or still going after too long: put down where it is (never in the air)
    const out = Math.abs(RV.x) > HALF_X - 0.05 || Math.abs(RV.z) > HALF_Z - 0.05;
    if (s.calm >= CALM_TIME || out || s.awake > 5 || s.body.isSleeping()) {
      s.state = F_REST;
      // resting on a tank (not on the ground): it would ride along when the tank drives, so it crumbles away at once
      if (y - g > s.r * 2.6 + 0.006) {
        s.age = s.life;
        s.quick = true;
      }
      if (out || s.awake > 5) {
        s.y = Math.max(g + s.r * 0.6, Math.min(s.y, g + s.r * 3));
        this.setInstance(s, 0);
      }
      P.settle(s);
    }
  }

  // sinking and freeing: the chunks that are at rest
  update(dt) {
    if (dt <= 0) return;
    let live = 0;
    for (const s of this.slots) {
      if (s.state === F_FREE) continue;
      live++;
      s.age += dt;
      if (s.state === F_REST && s.age > s.life) {
        s.state = F_SINK;
        s.sink = 0;
      }
      if (s.state === F_SINK) {
        s.sink += dt / (s.quick ? 0.35 : SINK_TIME);
        if (s.sink >= 1) {
          this.release(s);
          live--;
          continue;
        }
        const e = s.sink * s.sink * (3 - 2 * s.sink);
        const m = this.meshes[s.kind];
        const k = 1 - 0.55 * e;
        _m.compose(_p.set(s.x, s.y - s.r * 1.5 * e, s.z), _q.set(s.qx, s.qy, s.qz, s.qw), _s.set(s.sx * k, s.sy * k, s.sz * k));
        _m.toArray(m.instanceMatrix.array, s.i * 16);
        m.instanceMatrix.needsUpdate = true;
      }
    }
    this.live = live;
    this.used = live;
  }
}

// a lumpy little clod of radius about 1: rough, flat-cut, with uvs projected along the axis it faces
function chunkGeometry(seed, round) {
  const g = rockGeometry(seed, 2, { cuts: Math.round(2 + (1 - round) * 3), lumpy: 0.2 + (1 - round) * 0.25, reach: 0.62 + round * 0.2, flat: 0.55 + (1 - round) * 0.3 });
  g.computeVertexNormals();
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * UV_SPAN * 0.5;
    uv[i * 2 + 1] = v * UV_SPAN * 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export { RAPIER };
