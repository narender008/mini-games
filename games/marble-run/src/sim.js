// The marble simulation: physically driven motion along the track's lanes,
// with free flight in between, on a fixed 240 Hz step.
//
// On a lane a marble has three coordinates: how far along it is (s, with
// speed v) and where it sits in the round channel's cross-section (q, with
// velocity, measured from the channel's axis). Gravity along the lane
// speeds it up or slows it down (5/7 of it, as a rolling solid ball);
// gravity across the lane plus the centrifugal push of bends and dips moves
// it in the cross-section, where the channel wall holds it, so it banks up
// the outside of a bend, sloshes, and presses into the floor of a loop. A
// hard knock bounces it off the wall; if it rides over the top of an open
// trough it flies free. Rolling resistance grows with how hard it is
// pressed, so tight bends and loops cost speed like the real thing.
//
// A spiral funnel is a surface of revolution: the marble moves over it in
// polar coordinates, keeping its angular momentum, circling faster and
// faster as friction lets it sink towards the hole. A lift carries marbles
// up at a steady pace, one at a time. In flight a marble falls, bounces on
// the table and the pillars, and is caught by any open channel or funnel it
// drops into. Marbles knock into each other with glassy, nearly elastic
// collisions.
//
// Nothing can get lost for good: a marble that stops where it should not
// is nudged, and if that does not help (or it rolls off the edge), it is
// handed back to the game, which returns it to the bowl with a sparkle.
import * as THREE from 'three';
import { R_MARBLE } from './config.js';
import { makeFrame, DS } from './track/path.js';

const G = 9.81;
const ROLL = 5 / 7;
export const STEP = 1 / 240;
const r = R_MARBLE;
const WALL_T = 0.004; // channel wall thickness, for marbles bumping the outside
const HASH = 0.04;

const V = () => new THREE.Vector3();

let nextId = 1;

export class Marble {
  constructor(style = 0) {
    this.id = nextId++;
    this.style = style;
    this.state = 'free'; // lane | bowl | lift | free | gone
    this.pos = V();
    this.vel = V();
    this.omega = V();
    this.quat = new THREE.Quaternion();
    // lane state
    this.lane = null;
    this.s = 0;
    this.v = 0;
    this.qs = 0;
    this.qu = -0.005;
    this.vs = 0;
    this.vu = 0;
    this.contact = false;
    this.load = 0;
    // funnel state
    this.bowl = null;
    this.rho = 0;
    this.phi = 0;
    this.drho = 0;
    this.dphi = 0;
    this.bowlTime = 0;
    // lift state
    this.lift = null;
    // bookkeeping
    this.age = 0;
    this.still = 0;
    this.nudges = 0;
    this.ignore = null;
    this.ignoreT = 0;
    this.onGround = false;
    this.surface = 'wood';
    this.rolling = 0; // speed of rolling contact this step (0 when airborne)
    this.loopTop = null;
    this.trip = { bells: new Set(), loops: 0, wheels: 0, bowls: 0, spins: 0, goals: new Set() };
  }

  get speed() {
    return this.vel.length();
  }
}

export class Sim {
  constructor({ groundY = 0, bounds = null, groundSurface = 'wood', groundFriction = 0.5 } = {}) {
    this.groundY = groundY;
    this.bounds = bounds; // { minX, maxX, minZ, maxZ } where the ground is
    this.groundSurface = groundSurface;
    this.groundFriction = groundFriction;
    this.marbles = [];
    this.handlers = {};
    this.time = 0;
    this.acc = 0;
    this.boxes = [];
    this.extraBoxes = [];
    this.lanes = [];
    this.bowls = [];
    this.lifts = [];
    this.wheels = [];
    this.hash = new Map();
    this.f = makeFrame();
    this.f2 = makeFrame();
    this._a = V();
    this._b = V();
    this._c = V();
    this._n = V();
  }

  on(type, fn) {
    (this.handlers[type] ||= []).push(fn);
  }

  emit(type, e) {
    const list = this.handlers[type];
    if (list) for (const fn of list) fn(e);
  }

  // built: from Layout.build()
  setTrack(built, extraBoxes = []) {
    const prev = this.built;
    this.built = built;
    this.lanes = built.lanes;
    this.bowls = built.bowls;
    this.lifts = built.lifts;
    this.wheels = built.pieces.map((p) => p.mech.wheel).filter(Boolean);
    this.extraBoxes = extraBoxes;
    this.boxes = [
      ...built.pillars.map((p) => ({
        min: new THREE.Vector3(p.x - 0.019, p.y0, p.z - 0.019),
        max: new THREE.Vector3(p.x + 0.019, p.y1, p.z + 0.019),
        surface: 'wood',
      })),
      ...extraBoxes,
    ];
    this.hash.clear();
    for (const lane of this.lanes) {
      if (lane.kinematic) continue;
      for (let i = 0; i < lane.n; i += 3) {
        const k = hkey(lane.pos[i * 3], lane.pos[i * 3 + 1], lane.pos[i * 3 + 2]);
        let list = this.hash.get(k);
        if (!list) this.hash.set(k, (list = []));
        list.push(lane, i);
      }
    }
    // marbles on pieces that are still there move onto their new lanes
    if (prev) {
      const byKey = new Map();
      for (const inst of built.pieces) if (!byKey.has(pieceKey(inst.placement))) byKey.set(pieceKey(inst.placement), inst);
      const same = (inst) => (inst ? byKey.get(pieceKey(inst.placement)) || null : null);
      for (const m of this.marbles) {
        if (m.state === 'lane' && m.lane) {
          const lane = same(m.lane.piece)?.laneByName[m.lane.name];
          if (lane) m.lane = lane;
        } else if (m.state === 'bowl' && m.bowl) {
          const bowl = same(m.bowl.inst)?.bowl;
          if (bowl) m.bowl = bowl;
        } else if (m.state === 'lift' && m.lift) {
          const lift = same(m.lift.inst)?.lift;
          if (lift) {
            m.lift = lift;
            m.lane = lift.ride;
            lift.riders.push(m);
          }
        }
        if (m.ignore) m.ignore = same(m.ignore.piece)?.laneByName[m.ignore.name] || null;
        if (m.loopTop) m.loopTop = same(m.loopTop);
      }
    }
    // marbles on lanes that no longer exist take to the air
    for (const m of this.marbles) {
      if ((m.state === 'lane' && !this.lanes.includes(m.lane)) || (m.state === 'bowl' && !this.bowls.includes(m.bowl)) || (m.state === 'lift' && !this.lifts.includes(m.lift))) {
        if (m.lift) m.lift.riders = m.lift.riders.filter((x) => x !== m);
        m.state = 'free';
        m.lane = null;
        m.bowl = null;
        m.lift = null;
      }
    }
  }

  add(pos, vel = V(), style = 0) {
    const m = new Marble(style);
    m.pos.copy(pos);
    m.vel.copy(vel);
    m.quat.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    this.marbles.push(m);
    return m;
  }

  // put a marble straight onto a lane (for tests and the showcase)
  place(m, lane, s, v = 0) {
    m.state = 'lane';
    m.lane = lane;
    m.s = s;
    m.v = v;
    m.qs = 0;
    m.qu = -(lane.rc - r);
    m.vs = 0;
    m.vu = 0;
    this.syncLane(m);
  }

  remove(m) {
    if (m.lift) m.lift.riders = m.lift.riders.filter((x) => x !== m);
    m.state = 'gone';
    const i = this.marbles.indexOf(m);
    if (i >= 0) this.marbles.splice(i, 1);
  }

  clear() {
    for (const m of [...this.marbles]) this.remove(m);
    for (const l of this.lifts) l.riders.length = 0;
  }

  // Advance by dt seconds of real time, in fixed steps.
  step(dt) {
    this.acc = Math.min(this.acc + dt, 0.1);
    let n = 0;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.substep(STEP);
      n++;
    }
    for (const w of this.wheels) {
      if (!w.driven) w.omega *= Math.exp(-0.9 * dt);
      w.driven = false;
    }
    return n;
  }

  substep(h) {
    this.time += h;
    for (const m of this.marbles) {
      m.age += h;
      m.rolling = 0;
      if (m.ignoreT > 0) m.ignoreT -= h;
      switch (m.state) {
        case 'lane':
          this.laneStep(m, h);
          break;
        case 'bowl':
          this.bowlStep(m, h);
          break;
        case 'lift':
          this.liftStep(m, h);
          break;
        case 'free':
          this.freeStep(m, h);
          break;
        default:
          break;
      }
      // integrate the spin for drawing
      const w = m.omega.length();
      if (w > 1e-4) {
        this._q ||= new THREE.Quaternion();
        this._q.setFromAxisAngle(this._a.copy(m.omega).multiplyScalar(1 / w), w * h);
        m.quat.premultiply(this._q);
      }
      this.watch(m, h);
    }
    this.collideMarbles();
    for (const m of this.marbles) {
      if (!Number.isFinite(m.pos.x) || !Number.isFinite(m.pos.y) || !Number.isFinite(m.pos.z)) this.lose(m, 'broken');
    }
  }

  // ------------------------------------------------------------ lanes

  laneStep(m, h) {
    const lane = m.lane;
    if (lane.kinematic) return;
    const f = lane.frame(m.s, this.f);
    const gT = -G * f.t.y;
    const gU = -G * f.u.y;
    const gW = -G * f.w.y;
    const v = m.v;
    const kU = f.k.dot(f.u);
    const kW = f.k.dot(f.w);
    const geU = gU - v * v * kU;
    const geW = gW - v * v * kW;
    const rho = lane.rc - r;
    // across the channel
    const c = m.contact ? ROLL : 1;
    m.vs += c * geW * h;
    m.vu += c * geU * h;
    m.qs += m.vs * h;
    m.qu += m.vu * h;
    let N = 0;
    m.contact = false;
    // the wall the marble is against, if any: outward normal (nx, ny)
    let nx = 0;
    let ny = 0;
    let hit = false;
    if (lane.tube || m.qu <= 0) {
      const d = Math.hypot(m.qs, m.qu);
      if (d >= rho) {
        nx = m.qs / d;
        ny = m.qu / d;
        m.qs = nx * rho;
        m.qu = ny * rho;
        hit = true;
      }
    } else if (m.qu <= lane.hw) {
      if (Math.abs(m.qs) >= rho) {
        nx = Math.sign(m.qs);
        m.qs = nx * rho;
        hit = true;
      }
    } else if (Math.abs(m.qs) > rho + 0.0015 || m.qu > lane.hw + 0.02) {
      // over the top of the wall: off the track
      this.launch(m, 'over');
      return;
    }
    if (hit) {
      const vn = m.vs * nx + m.vu * ny;
      if (vn > 0) {
        if (vn > 0.09) {
          m.vs -= (1 + lane.e) * vn * nx;
          m.vu -= (1 + lane.e) * vn * ny;
          this.emit('impact', { m, strength: Math.min(1, vn / 1.2), surface: lane.surface });
        } else {
          m.vs -= vn * nx;
          m.vu -= vn * ny;
        }
      }
      // rolling round the channel is damped, like a real marble settling
      const vt = -m.vs * ny + m.vu * nx;
      const dv = vt * (Math.exp(-6 * h) - 1);
      m.vs += dv * -ny;
      m.vu += dv * nx;
      const curl = ny !== 0 || lane.tube ? (vt * vt) / Math.max(rho, 1e-4) : 0;
      N = geW * nx + geU * ny + curl;
      m.contact = N > 0 || vn > -0.02;
      m.load = Math.max(0, N);
      if (m.contact) {
        // spin: rolling on the wall at the contact point
        const nW = this._n.copy(f.w).multiplyScalar(nx).addScaledVector(f.u, ny);
        this.syncLane(m, f);
        m.omega.crossVectors(nW, m.vel).multiplyScalar(-1 / r);
      }
    }
    // along the lane
    if (lane.wheel) {
      // riding a paddle of the wheel: the wheel's inertia shares the pull
      const w = lane.wheel;
      const a = gT / 2 - Math.sign(m.v) * (0.25 + 0.4 * Math.abs(m.v));
      m.v += a * h;
      if (m.v < 0.12) m.v = 0.12; // the paddle never lets it roll back
      w.omega = -m.v / w.radius;
      w.driven = true;
    } else {
      const a = (m.contact ? ROLL : 1) * gT;
      const res = m.contact ? lane.rr * m.load + 0.12 * m.v * m.v : 0.02 * m.v * m.v;
      if (Math.abs(m.v) < res * h * 1.5 && Math.abs(a) < lane.rr * m.load) m.v = 0;
      else m.v += (a - Math.sign(m.v) * res) * h;
    }
    const s0 = m.s;
    m.s += m.v * h;
    if (m.contact) m.rolling = Math.abs(m.v);
    m.surface = lane.surface;
    // things along the lane
    if (lane.events.length) this.crossEvents(m, lane, s0, m.s);
    // ends
    if (m.s > lane.length) this.leaveLane(m, lane, lane.end, m.s - lane.length, true);
    else if (m.s < 0) this.leaveLane(m, lane, lane.start, -m.s, false);
    if (m.state === 'lane') this.syncLane(m);
  }

  crossEvents(m, lane, s0, s1) {
    for (const e of lane.events) {
      if (!(s0 < e.s && s1 >= e.s) && !(s1 < e.s && s0 >= e.s && e.type !== 'goal')) continue;
      const forward = s1 > s0;
      switch (e.type) {
        case 'bell':
          if (forward || Math.abs(m.v) > 0.15) {
            m.trip.bells.add(e.inst);
            this.emit('bell', { m, inst: e.inst, mech: e.mech, strength: Math.min(1, Math.abs(m.v) / 1.2) });
          }
          break;
        case 'spinner':
          m.trip.spins++;
          this.emit('spinner', { m, inst: e.inst, mech: e.mech, speed: m.v });
          break;
        case 'loopTop':
          if (forward) m.loopTop = e.inst;
          break;
        case 'loopEnd':
          if (forward && m.loopTop === e.inst) {
            m.trip.loops++;
            m.loopTop = null;
            this.emit('loop', { m, inst: e.inst });
          }
          break;
        case 'goal':
          if (forward) {
            m.trip.goals.add(e.inst);
            this.emit('goal', { m, inst: e.inst, mech: e.mech });
          }
          break;
        default:
          break;
      }
    }
  }

  // Beyond the end (atEnd) or the start of a lane by `over` metres.
  leaveLane(m, lane, link, over, atEnd) {
    switch (link.type) {
      case 'switch': {
        const mech = link.mech;
        const next = link.options[mech.side];
        mech.side = 1 - mech.side;
        this.emit('switch', { m, inst: link.inst, side: mech.side });
        this.enterLane(m, lane, next, false, over, atEnd);
        break;
      }
      case 'link':
        this.enterLane(m, lane, link.lane, link.atEnd, over, atEnd);
        break;
      case 'bowl':
        this.syncLane(m);
        this.enterBowl(m, link.bowl);
        break;
      case 'lift': {
        const lift = link.lift;
        if (lift.riders.every((x) => x.s > lift.spacing)) {
          if (m.lift) m.lift.riders = m.lift.riders.filter((x) => x !== m);
          m.state = 'lift';
          m.lift = lift;
          m.lane = lift.ride;
          m.s = 0;
          m.v = lift.speed;
          lift.riders.push(m);
          this.emit('lift', { m, lift });
          this.syncLift(m);
        } else {
          // wait at the foot of the lift
          m.s = atEnd ? lane.length - 0.0005 : 0.0005;
          m.v = -0.15 * m.v;
        }
        break;
      }
      case 'wall': {
        const sp = Math.abs(m.v);
        m.s = atEnd ? lane.length - over * lane.e : over * lane.e;
        m.v = -m.v * lane.e;
        if (sp > 0.12) this.emit('impact', { m, strength: Math.min(1, sp / 1.2), surface: lane.surface });
        break;
      }
      default:
        this.launch(m, 'end');
        break;
    }
  }

  enterLane(m, from, to, toAtEnd, over, fromAtEnd) {
    // direction along the new lane: into its start means forwards
    const dirSame = (fromAtEnd && !toAtEnd) || (!fromAtEnd && toAtEnd);
    const speed = Math.abs(m.v);
    const moving = fromAtEnd ? 1 : -1; // +1: was moving forwards on `from`
    m.lane = to;
    if (!toAtEnd) {
      m.s = over;
      m.v = speed;
    } else {
      m.s = to.length - over;
      m.v = -speed;
    }
    if (!dirSame) {
      m.qs = -m.qs;
      m.vs = -m.vs;
    }
    // a different channel: keep the marble inside it
    this.fitChannel(m, to);
    if (from.piece !== to.piece) {
      // the change of channel at a join takes the edge off any sloshing
      m.vs *= 0.6;
      m.vu *= 0.6;
      m.v *= 0.992;
      if (speed > 0.05) this.emit('join', { m, strength: Math.min(1, speed / 1.5), surface: to.surface });
      if (to.tube && !from.tube) this.emit('tube', { m, speed });
    }
    if (to.wheel && moving > 0 && !toAtEnd) {
      // landing on a paddle: the wheel and the marble share their momentum
      const w = to.wheel;
      m.v = (m.v + -w.omega * w.radius) / 2;
      m.trip.wheels++;
      this.emit('wheelOn', { m, wheel: w, inst: to.piece });
    }
    if (m.s > to.length || m.s < 0) m.s = Math.max(0, Math.min(to.length, m.s));
  }

  // keep lane coordinates inside a channel's shape
  fitChannel(m, lane) {
    const rho = lane.rc - r;
    if (lane.tube || m.qu <= 0) {
      const d = Math.hypot(m.qs, m.qu);
      if (d > rho) {
        m.qs *= rho / d;
        m.qu *= rho / d;
      }
    } else {
      if (Math.abs(m.qs) > rho) m.qs = Math.sign(m.qs) * rho;
      if (m.qu > lane.hw) m.qu = lane.hw;
    }
  }

  // world position and velocity from lane coordinates
  syncLane(m, f = null) {
    const lane = m.lane;
    f = f || lane.frame(m.s, this.f2);
    const axis = lane.rc - r;
    m.pos.copy(f.p).addScaledVector(f.u, axis + m.qu).addScaledVector(f.w, m.qs);
    m.vel.copy(f.t).multiplyScalar(m.v).addScaledVector(f.w, m.vs).addScaledVector(f.u, m.vu);
  }

  launch(m, why) {
    this.syncLane(m);
    // leaving by an open end: don't fall straight back into the same mouth
    m.ignore = why === 'end' ? m.lane : null;
    m.ignoreT = why === 'end' ? 0.12 : 0;
    m.state = 'free';
    m.lane = null;
    m.contact = false;
    this.emit('launch', { m, why });
  }

  // ------------------------------------------------------------ funnels

  enterBowl(m, bowl) {
    const dx = m.pos.x - bowl.x;
    const dz = m.pos.z - bowl.z;
    m.state = 'bowl';
    m.bowl = bowl;
    m.lane = null;
    m.rho = Math.min(bowl.R, Math.max(bowl.hole * 1.2, Math.hypot(dx, dz)));
    m.phi = Math.atan2(dz, dx);
    const c = Math.cos(m.phi);
    const s = Math.sin(m.phi);
    m.drho = m.vel.x * c + m.vel.z * s;
    m.dphi = (-m.vel.x * s + m.vel.z * c) / m.rho;
    m.bowlTime = 0;
    m.trip.bowls++;
    this.emit('bowlIn', { m, bowl });
    this.syncBowl(m);
  }

  bowlStep(m, h) {
    const b = m.bowl;
    m.bowlTime += h;
    let rho = m.rho;
    const fp = b.fp(rho);
    const fpp = b.fpp(rho);
    const den = 1 + fp * fp;
    const rdd = (rho * m.dphi * m.dphi - ROLL * G * fp - fp * fpp * m.drho * m.drho) / den;
    const pdd = (-2 * m.drho * m.dphi) / rho;
    m.drho += rdd * h;
    m.dphi += pdd * h;
    const vS = Math.sqrt(den * m.drho * m.drho + rho * rho * m.dphi * m.dphi);
    // friction, a little stronger the longer it circles, so it always drops in
    const decel = 0.16 + 0.1 * vS + 0.05 * vS * vS + Math.max(0, m.bowlTime - 6) * 0.2;
    if (vS > 1e-5) {
      const k = Math.max(0, 1 - (decel * h) / vS);
      m.drho *= k;
      m.dphi *= k;
    }
    m.rho += m.drho * h;
    m.phi += m.dphi * h;
    if (m.rho > b.R) {
      // against the rim: it slides round it (a bounce only if it hit hard)
      m.rho = b.R;
      if (m.drho > 0) {
        if (m.drho > 0.2) {
          this.emit('impact', { m, strength: Math.min(1, m.drho / 1.2), surface: b.surface || 'plastic' });
          m.drho = -0.25 * m.drho;
        } else m.drho = 0;
      }
    }
    m.rolling = vS;
    m.surface = b.surface || 'plastic';
    this.syncBowl(m);
    if (m.rho < b.hole) {
      // through the hole and down the bore
      const exit = b.exit;
      const down = Math.max(0.2, fp * -m.drho);
      const hv = V().set(m.vel.x, 0, m.vel.z);
      m.state = 'lane';
      m.bowl = null;
      m.lane = exit;
      m.s = 0.001;
      m.v = down;
      const f = exit.frame(0, this.f);
      const off = V().set(m.pos.x - b.x, 0, m.pos.z - b.z);
      m.qs = off.dot(f.w);
      m.qu = off.dot(f.u);
      this.fitChannel(m, exit);
      m.vs = hv.dot(f.w) * 0.6;
      m.vu = hv.dot(f.u) * 0.6;
      this.emit('bowlOut', { m, bowl: b });
      this.syncLane(m);
    }
  }

  syncBowl(m) {
    const b = m.bowl;
    const c = Math.cos(m.phi);
    const s = Math.sin(m.phi);
    m.pos.set(b.x + m.rho * c, b.rimY + b.f(m.rho), b.z + m.rho * s);
    const fp = b.fp(m.rho);
    const vt = m.rho * m.dphi;
    m.vel.set(m.drho * c - vt * s, fp * m.drho, m.drho * s + vt * c);
    // spin about the surface normal's cross with the motion
    const n = this._n.set(-fp * c, 1, -fp * s).normalize();
    m.omega.crossVectors(n, m.vel).multiplyScalar(-1 / r);
  }

  // ------------------------------------------------------------ lifts

  liftStep(m, h) {
    const lift = m.lift;
    m.s += lift.speed * h;
    m.v = lift.speed;
    lift.running = 1;
    if (m.s >= lift.ride.length) {
      lift.riders = lift.riders.filter((x) => x !== m);
      m.lift = null;
      m.state = 'lane';
      m.qs = 0;
      m.qu = -(lift.ride.rc - r);
      m.vs = 0;
      m.vu = 0;
      const link = lift.ride.end;
      if (link.type === 'link') this.enterLane(m, lift.ride, link.lane, link.atEnd, m.s - lift.ride.length, true);
      else this.launch(m, 'lift');
      if (m.state === 'lane') {
        m.v = Math.max(m.v, 0.12);
        this.syncLane(m);
      }
      this.emit('liftTop', { m, lift });
      return;
    }
    this.syncLift(m);
  }

  syncLift(m) {
    const lane = m.lift.ride;
    const f = lane.frame(m.s, this.f2);
    m.pos.copy(f.p);
    m.vel.copy(f.t).multiplyScalar(m.lift.speed);
    m.omega.set(0, 3, 0);
  }

  // ------------------------------------------------------------ flight

  freeStep(m, h) {
    const p = m.pos;
    const v = m.vel;
    v.y -= G * h;
    v.multiplyScalar(1 - 0.05 * h);
    p.addScaledVector(v, h);
    m.onGround = false;
    // the table or base
    const b = this.bounds;
    const overGround = !b || (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ);
    if (overGround && p.y < this.groundY + r) {
      p.y = this.groundY + r;
      if (v.y < 0) {
        const vn = -v.y;
        if (vn > 0.12) {
          v.y = vn * 0.38;
          this.emit('impact', { m, strength: Math.min(1, vn / 1.5), surface: this.groundSurface });
        } else v.y = 0;
      }
      m.onGround = true;
      // rolling on the table: slows gently to a stop
      const hs = Math.hypot(v.x, v.z);
      if (hs > 1e-4) {
        const k = Math.max(0, 1 - (this.groundFriction * h) / hs);
        v.x *= k;
        v.z *= k;
      }
      m.rolling = hs;
      m.surface = this.groundSurface;
      m.omega.set(v.z, 0, -v.x).multiplyScalar(1 / r);
    }
    // pillars and other solid parts
    for (const box of this.boxes) this.collideBox(m, box);
    // channels and funnels
    this.catchOrBump(m);
    if (m.state === 'free') {
      for (const bowl of this.bowls) {
        const dx = p.x - bowl.x;
        const dz = p.z - bowl.z;
        const rho = Math.hypot(dx, dz);
        if (rho > bowl.R || rho < bowl.hole) continue;
        const ys = bowl.rimY + bowl.f(rho);
        if (p.y < ys + 0.002 && p.y > ys - 0.03) {
          const vn = Math.max(0, -v.y);
          if (vn > 0.15) this.emit('impact', { m, strength: Math.min(1, vn / 1.5), surface: 'plastic' });
          v.y = 0;
          this.enterBowl(m, bowl);
          break;
        }
      }
    }
    if (p.y < this.groundY - 0.4) this.lose(m, 'fell');
  }

  collideBox(m, box) {
    const p = m.pos;
    const cx = Math.max(box.min.x, Math.min(p.x, box.max.x));
    const cy = Math.max(box.min.y, Math.min(p.y, box.max.y));
    const cz = Math.max(box.min.z, Math.min(p.z, box.max.z));
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dz = p.z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) return;
    let n;
    let d = Math.sqrt(d2);
    if (d < 1e-6) {
      // centre inside the box: out through the nearest face
      n = this._n.set(0, 1, 0);
      d = 0;
      p.y = box.max.y;
    } else n = this._n.set(dx / d, dy / d, dz / d);
    p.addScaledVector(n, r - d);
    const vn = m.vel.dot(n);
    if (vn < 0) {
      if (-vn > 0.15) this.emit('impact', { m, strength: Math.min(1, -vn / 1.5), surface: box.surface || 'wood' });
      m.vel.addScaledVector(n, -(1 + 0.35) * vn);
    }
    if (n.y > 0.7) {
      m.onGround = true;
      const hs = Math.hypot(m.vel.x, m.vel.z);
      if (hs > 1e-4) {
        const k = Math.max(0, 1 - (0.6 * 0.0042) / hs);
        m.vel.x *= k;
        m.vel.z *= k;
      }
    }
  }

  // A marble in the air near a lane: caught if it is inside the channel,
  // pushed off if it hits the channel's outside.
  catchOrBump(m) {
    const p = m.pos;
    const ix = Math.floor(p.x / HASH);
    const iy = Math.floor(p.y / HASH);
    const iz = Math.floor(p.z / HASH);
    const best = this._best || (this._best = new Map());
    best.clear();
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (let c = -1; c <= 1; c++) {
          const list = this.hash.get(`${ix + a},${iy + b},${iz + c}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 2) {
            const lane = list[k];
            const i = list[k + 1];
            const dx = lane.pos[i * 3] - p.x;
            const dy = lane.pos[i * 3 + 1] - p.y;
            const dz = lane.pos[i * 3 + 2] - p.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            const cur = best.get(lane);
            if (!cur || d2 < cur.d2) best.set(lane, { i, d2 });
          }
        }
      }
    }
    for (const [lane, { i }] of best) {
      if (lane === m.ignore && m.ignoreT > 0) continue;
      const near = lane.nearest(p, Math.max(0, i - 4), Math.min(lane.n - 1, i + 4));
      let s = near.i * DS;
      const f = lane.frame(s, this.f);
      const axis = this._a.copy(f.p).addScaledVector(f.u, lane.rc - r);
      const rel = this._b.subVectors(p, axis);
      s += rel.dot(f.t);
      if (s < 0.002 || s > lane.length - 0.002) {
        // past an end: only the open mouth, no walls to hit
        continue;
      }
      lane.frame(s, f);
      axis.copy(f.p).addScaledVector(f.u, lane.rc - r);
      rel.subVectors(p, axis);
      const qs = rel.dot(f.w);
      const qu = rel.dot(f.u);
      const rho = lane.rc - r;
      const rin = rho + 3e-4;
      const inside = lane.tube ? Math.hypot(qs, qu) < rin : Math.abs(qs) < rin && qu < lane.hw + 0.004 && (qu > 0 || Math.hypot(qs, qu) < rin);
      if (inside) {
        // caught
        const vn = -m.vel.dot(f.u);
        m.state = 'lane';
        m.lane = lane;
        m.s = s;
        m.v = m.vel.dot(f.t);
        m.qs = qs;
        m.qu = qu;
        m.vs = m.vel.dot(f.w);
        m.vu = m.vel.dot(f.u);
        m.contact = false;
        this.fitChannel(m, lane);
        this.emit('land', { m, lane, strength: Math.min(1, Math.max(0, vn) / 1.5) });
        return;
      }
      // bumping the outside of the channel
      const out = lane.rc + WALL_T + r;
      let nx = 0;
      let ny = 0;
      let push = 0;
      if (lane.tube || qu <= 0) {
        const d = Math.hypot(qs, qu);
        if (d < out && d > 1e-6) {
          nx = qs / d;
          ny = qu / d;
          push = out - d;
        }
      } else if (qu < lane.hw + WALL_T + r && Math.abs(qs) < out) {
        // beside an upright wall, or on its top edge
        const side = out - Math.abs(qs);
        const top = lane.hw + WALL_T + r - qu;
        if (Math.abs(qs) > rho && side < top) {
          nx = Math.sign(qs);
          push = side;
        } else if (Math.abs(qs) > rho) {
          ny = 1;
          push = top;
        }
      }
      if (push > 0) {
        const n = this._n.copy(f.w).multiplyScalar(nx).addScaledVector(f.u, ny);
        p.addScaledVector(n, push);
        const vn = m.vel.dot(n);
        if (vn < 0) {
          if (-vn > 0.15) this.emit('impact', { m, strength: Math.min(1, -vn / 1.5), surface: lane.surface });
          m.vel.addScaledVector(n, -(1 + 0.35) * vn);
        }
      }
    }
  }

  // ------------------------------------------------------------ marble on marble

  collideMarbles() {
    const list = this.marbles;
    const n = this._n;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'gone' || a.fading) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'gone' || b.fading) continue;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= 4 * r * r || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        n.set(dx / d, dy / d, dz / d);
        const wa = a.state === 'lift' ? 0 : 1;
        const wb = b.state === 'lift' ? 0 : 1;
        if (wa + wb === 0) continue;
        const overlap = 2 * r - d;
        const rel = a.vel.dot(n) - b.vel.dot(n);
        const da = this._a.set(0, 0, 0);
        const db = this._b.set(0, 0, 0);
        const pa = this._c.copy(n).multiplyScalar((-overlap * wa) / (wa + wb));
        const pb = V().copy(n).multiplyScalar((overlap * wb) / (wa + wb));
        if (rel > 0) {
          const e = rel > 0.06 ? 0.86 : 0.1;
          const jmp = ((1 + e) * rel) / (wa + wb);
          da.copy(n).multiplyScalar(-jmp * wa);
          db.copy(n).multiplyScalar(jmp * wb);
          if (rel > 0.07) this.emit('clack', { a, b, strength: Math.min(1, rel / 1.2), pos: a.pos });
        }
        if (wa) this.nudgeState(a, pa, da);
        if (wb) this.nudgeState(b, pb, db);
      }
    }
  }

  // move a marble by dp and change its velocity by dv, in its own terms
  nudgeState(m, dp, dv) {
    if (m.state === 'lane') {
      const f = m.lane.frame(m.s, this.f);
      m.s = Math.max(0, Math.min(m.lane.length, m.s + dp.dot(f.t)));
      m.qs += dp.dot(f.w);
      m.qu += dp.dot(f.u);
      this.fitChannel(m, m.lane);
      m.v += dv.dot(f.t);
      m.vs += dv.dot(f.w);
      m.vu += dv.dot(f.u);
      this.syncLane(m, null);
    } else if (m.state === 'bowl') {
      const c = Math.cos(m.phi);
      const s = Math.sin(m.phi);
      const rr = dp.x * c + dp.z * s;
      const tt = -dp.x * s + dp.z * c;
      m.rho = Math.min(m.bowl.R, Math.max(m.bowl.hole * 1.01, m.rho + rr));
      m.phi += tt / m.rho;
      m.drho += dv.x * c + dv.z * s;
      m.dphi += (-dv.x * s + dv.z * c) / m.rho;
      this.syncBowl(m);
    } else if (m.state === 'free') {
      m.pos.add(dp);
      m.vel.add(dv);
    }
  }

  // ------------------------------------------------------------ keeping things moving

  watch(m, h) {
    if (m.state === 'lane') {
      const lane = m.lane;
      const waiting = lane.end.type === 'lift' || lane.piece?.def.id === 'catcher' || lane.piece?.def.id === 'goal';
      if (Math.abs(m.v) < 0.02 && !waiting) m.still += h;
      else m.still = Math.max(0, m.still - h * 0.5);
      if (m.still > 1.2) {
        m.still = 0;
        m.nudges++;
        if (m.nudges > 3) {
          this.lose(m, 'stuck');
          return;
        }
        // a gentle push the way the track runs
        const f = lane.frame(m.s, this.f);
        const dir = f.t.y < -0.01 ? 1 : f.t.y > 0.01 ? -1 : 1;
        m.v += dir * 0.22;
        m.vu += 0.02;
        this.emit('nudge', { m });
      }
      if (waiting && Math.abs(m.v) < 0.02 && lane.end.type !== 'lift') {
        m.rest = (m.rest || 0) + h;
        if (m.rest > 1.6) this.lose(m, 'home');
      } else m.rest = 0;
    } else if (m.state === 'free') {
      if (m.onGround && m.vel.lengthSq() < 0.03 * 0.03) {
        m.still += h;
        if (m.still > 0.5) this.lose(m, 'rest');
      } else m.still = 0;
      if (m.age > 0.5 && m.vel.lengthSq() < 1e-6 && !m.onGround) {
        m.still += h;
        if (m.still > 0.8) this.lose(m, 'stuck');
      }
    }
  }

  // hand a marble back to the game (it sparkles home)
  lose(m, why) {
    if (m.state === 'gone' || m.lost) return;
    m.lost = why;
    this.emit('lost', { m, why });
  }
}

// the same piece in the same place, across rebuilds and undo
function pieceKey(p) {
  return `${p.type},${p.i},${p.j},${p.level},${p.rot},${p.h ?? ''},${p.out ?? ''}`;
}

function hkey(x, y, z) {
  return `${Math.floor(x / HASH)},${Math.floor(y / HASH)},${Math.floor(z / HASH)}`;
}
