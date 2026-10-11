// One run: the world built for a track, the launch, the crash and the
// score. Phases: 'aim' (the player sets speed, angle and power; the world
// already moves: traffic, wrecking balls), 'drive' (a car or ramp ride is
// under way with him in the seat), 'flight' (he is loose: tuck to flip,
// release to spread) and 'done' (he has come to rest, or time ran out).
// After every physics step the impacts the solver reported become damage,
// broken bones, torn limbs, smashed crates, shattered glass and exploding
// drums; the run says what happened through a ring of event records the app
// reads each frame (effects, sound, popups), and logs the effects for the
// replay. Building a run allocates; stepping one does not, except a few
// small records on rare events (a crate breaking, a drum going off).
import { Physics, pl, CAT } from '../sim/physics.js';
import { Ragdoll, POSES } from '../sim/ragdoll.js';
import { Ride, Launcher } from '../sim/rides.js';
import { buildProp, breakProp, removeProp, KINDS } from '../sim/props.js';
import { Terrain } from '../sim/terrain.js';
import { Score, FRACTURE, BONES, FRACTURE_PAY } from './score.js';
import { Replay } from './replay.js';
import { STEP, G, clamp, rand, TAU } from '../config.js';

const GROUND_MAT = { testtrack: 'concrete', quarry: 'dirt', circus: 'dirt', highway: 'concrete', construction: 'dirt', snow: 'snow', city: 'concrete', junkyard: 'dirt', harbour: 'concrete', volcano: 'concrete' };
const AIR_MIN = 0.9; // seconds in the air that count as AIRTIME
const BIG = 200; // N·s: a knock this hard (and harder than the last big one) gets the slow motion
const SNAP_LOAD = 22; // N·s on a neck joint's limit in one step
const KO_HIT = 170; // N·s on the head
const STILL_SPEED = 0.55;
const STILL_TIME = 1.0;
const MAX_FLIGHT = 14;
const EVENTS = 512;
// face codes for the replay: calm, scared, pain, ko, dead
export const FACES = ['calm', 'scared', 'pain', 'ko', 'dead'];

class Events {
  constructor(n) {
    this.list = [];
    for (let i = 0; i < n; i++) this.list.push({ type: '', x: 0, y: 0, nx: 0, ny: 0, s: 0, mat: '', ref: null, ref2: null, name: '', amount: 0, text: null });
    this.head = 0;
    this.tail = 0;
  }

  push(type, x, y, nx, ny, s, mat, ref) {
    const e = this.list[this.head % this.list.length];
    this.head++;
    if (this.head - this.tail > this.list.length) this.tail = this.head - this.list.length;
    e.type = type;
    e.x = x;
    e.y = y;
    e.nx = nx;
    e.ny = ny;
    e.s = s;
    e.mat = mat;
    e.ref = ref;
    e.ref2 = null;
    e.name = '';
    e.amount = 0;
    e.text = null;
    return e;
  }

  // the next unread event, or null
  next() {
    if (this.tail >= this.head) return null;
    return this.list[this.tail++ % this.list.length];
  }

  clear() {
    this.tail = this.head;
  }
}

export class Run {
  constructor() {
    this.events = new Events(EVENTS);
    this.score = new Score();
    this.replay = new Replay();
    this.tmp = pl.Vec2(0, 0);
    this.m = { x: 0, y: 0 };
    this.queue = []; // actions decided inside the solver, done after the step
    this.phase = 'none';
  }

  // opts: { ride, speedMul, powerMul, air, bones, god }
  build(track, opts) {
    this.track = track;
    this.opts = opts;
    const ph = new Physics();
    this.phys = ph;
    ph.onPreSolve = (c, a, b, vn, nx, ny) => this.preSolve(c, a, b, vn, nx, ny);
    ph.onBegin = (a, b) => this.begin(a, b);
    const T = new Terrain(track.ground, GROUND_MAT[track.world] || 'dirt');
    T.build(ph);
    this.terrain = T;
    const rag = new Ragdoll(ph);
    rag.strength = opts.god ? 50 : 1 - (opts.bones || 0) * 0.12;
    rag.spinTorque *= 1 + (opts.air || 0) * 0.3;
    this.rag = rag;
    this.fracMul = 1 - (opts.bones || 0) * 0.1;
    const at = (x) => T.at(x);
    this.props = track.props.map((s) => buildProp(ph, s, at));
    this.ride = null;
    this.launcher = null;
    const x = track.start.x;
    if (track.kind === 'cannon') {
      this.launcher = new Launcher(opts.ride, x, T.at(x), { powerMul: opts.powerMul });
      this.launcher.angle = ((track.start.angle ?? 30) * Math.PI) / 180;
      this.launcher.power = track.start.power ?? 0.7;
      // he waits inside the barrel, out of the world
      for (const p of rag.parts) {
        p.body.setActive(false);
        p.item.vis = false;
      }
    } else {
      this.ride = new Ride(ph, rag, opts.ride, x, T.at(x), T.slope(x), { speedMul: opts.speedMul, ground: T });
      this.ride.seat();
    }
    this.score.reset();
    this.phase = 'aim';
    this.aim = track.kind === 'car' ? 0.7 : track.kind === 'ramp' ? 0.75 : this.launcher.power;
    this.events.clear();
    this.queue.length = 0;
    this.air = 0;
    this.airTotal = 0;
    this.flip = 0;
    this.flips = 0;
    this.lastA = 0;
    this.still = 0;
    this.flightT = 0;
    this.launchT = 0;
    this.launchX = x;
    this.lastBig = 0;
    this.lastBigT = -9;
    this.landed = false; // first touch after leaving
    this.burning = 0;
    this.hold = false; // the player is holding (tuck)
    this.holdDir = 0;
    this.spreadT = 0;
    this.face = 0;
    this.painT = 0;
    this.endT = 0;
    this.impaled = 0;
    this.inWater = false;
    this.inLava = false;
    this.lavaT = 0;
    this.chain = []; // explosions waiting to go off: { prop, t }
    this.snapped = false;
    this.ko = false;
    this.headFirst = false;
    this.bounces = 0;
    this.lastBounceT = -9;
    this.hitBefore = false;
    this.keepAir = false;
    this.speedNow = 0;
    this.done = false;
    this.replay.begin(ph.items);
  }

  get flying() {
    return this.phase === 'flight';
  }

  // ------------------------------------------------------------ the launch
  launch(params = {}) {
    if (this.phase !== 'aim') return false;
    const ph = this.phys;
    this.launchT = ph.time;
    if (this.ride) {
      const s = clamp(params.aim ?? this.aim, 0.15, 1);
      const ramp = this.ride.kind === 'ramp';
      this.ride.launch(ramp ? s * this.ride.top * 0.7 : s * this.ride.top);
      if (ramp && this.ride.id === 'bike') this.ride.target = s * this.ride.top;
      this.launchX = this.ride.chassis.getPosition().x;
      this.phase = 'drive';
      this.events.push('launch', this.launchX, 0, 0, 0, s, this.ride.kind, this.ride);
    } else {
      const L = this.launcher;
      if (params.angle !== undefined) L.angle = params.angle;
      if (params.power !== undefined) L.power = params.power;
      L.power = clamp(L.power, 0.15, 1);
      for (const p of this.rag.parts) {
        p.body.setActive(true);
        p.item.vis = true;
      }
      const v = L.fire(this.rag);
      L.muzzle(this.m);
      this.launchX = this.m.x;
      this.startFlight();
      this.events.push('launch', this.m.x, this.m.y, Math.cos(L.angle), Math.sin(L.angle), L.power, 'cannon', L);
      this.score.top = v;
    }
    return true;
  }

  startFlight() {
    this.phase = 'flight';
    this.flightT = 0;
    this.lastA = this.rag.chest.body.getAngle();
    this.flip = 0;
    if (!this.keepAir) this.air = 0;
    this.keepAir = false;
    this.landed = false;
    if (!this.hold) this.rag.control = this.launcher ? 'pose' : 'limp';
    this.spreadT = this.launcher ? 0.5 : 0;
    // a hold that began before he left (the bail tap, or held through the crash) tucks him now
    if (this.hold) this.setHold(true, this.holdDir);
  }

  // The player holds (tuck and spin) or lets go (spread for a moment, then limp).
  setHold(on, dir = 0) {
    this.hold = on;
    this.holdDir = dir;
    const rag = this.rag;
    if (this.phase === 'drive' && on && this.ride && this.ride.kind === 'ramp') {
      if (this.ride.bail()) {
        this.stunt('BAIL');
        this.startFlight();
      }
      return;
    }
    if (this.phase !== 'flight') return;
    if (on) {
      rag.control = 'tuck';
      rag.target = POSES.tuck;
      const w = rag.chest.body.getAngularVelocity();
      rag.spin = dir || (Math.abs(w) > 1 ? Math.sign(w) : 1);
    } else {
      rag.control = 'spread';
      rag.target = POSES.spread;
      rag.spin = 0;
      this.spreadT = 0.6;
    }
  }

  // ------------------------------------------------------------- stepping
  step(dt) {
    const ph = this.phys;
    const rag = this.rag;
    if (this.ride) this.ride.before(dt);
    rag.muscles(dt);
    if (this.inWater || this.inLava || this.track.water || this.track.lava) this.fluids(dt);
    ph.step(dt);
    this.flush();
    if (this.ride) {
      const r = this.ride.after(dt);
      if (r) this.onEject(r);
    }
    rag.tear(ph.time, (j) => this.onTear(j));
    this.impactsAfter();
    this.traffic();
    this.chains();
    if (this.phase === 'drive' || this.phase === 'flight') this.track3(dt);
    if (this.phase !== 'aim' && this.phase !== 'done' && (ph.steps & 1) === 0) this.replay.record(ph.time, this.faceCode(), this.ride ? this.ride.crush : 0);
  }

  faceCode() {
    const rag = this.rag;
    if (!rag.byId.head.attached) return 4;
    if (!rag.conscious) return 3;
    if (this.painT > 0) return 2;
    if (this.phase === 'flight' || (this.phase === 'drive' && this.speedNow > 15)) return 1;
    return 0;
  }

  // things decided during the solve (world locked), done now
  flush() {
    const q = this.queue;
    for (let i = 0; i < q.length; i++) {
      const a = q[i];
      switch (a.type) {
        case 'shatter':
          this.shatter(a.prop, a.x, a.y, a.by);
          break;
        case 'screen':
          this.screenOut(a.ride, a.x, a.y);
          break;
        case 'bounce':
          this.bounce(a.prop, a.vn);
          break;
        case 'kick':
          this.kick(a.prop, a.part);
          break;
        case 'smash':
          this.smash(a.prop, a.by, a.x, a.y);
          break;
        case 'impale':
          this.impale(a.prop, a.part, a.x, a.y);
          break;
      }
    }
    q.length = 0;
  }

  onEject(kind) {
    const ride = this.ride;
    this.keepAir = true;
    const v = ride.prevV;
    this.score.impact = v;
    if (kind === 'crash') {
      const p = ride.chassis.getPosition();
      const d = ride.def;
      if (ride.screen && !ride.screen.broken) {
        ride.screen.broken = true;
        const g = d.glass;
        const w = ride.chassis.getWorldPoint(this.tmp.set((g[0][0] + g[1][0]) / 2, (g[0][1] + g[1][1]) / 2));
        this.screenOut(ride, w.x, w.y);
      }
      this.events.push('crash', p.x + d.profile[2][0] * Math.cos(ride.chassis.getAngle()), p.y, 1, 0, clamp(v / 40, 0.2, 1), 'metal', ride);
    }
    this.startFlight();
  }

  // ------------------------------------------------------------- contacts
  preSolve(c, a, b, vn, nx, ny) {
    // make `a` the special one (the owner with pre set that matters)
    if (a.kind === 'part' && b.kind !== 'part' && b.pre) return this.preSolve2(c, b, a, -vn, -nx, -ny, true);
    if (b.kind === 'part' && a.pre) return this.preSolve2(c, a, b, vn, nx, ny, true);
    if (a.pre && a.kind === 'prop') return this.preSolve2(c, a, b, vn, nx, ny, false);
    if (b.pre && b.kind === 'prop') return this.preSolve2(c, b, a, -vn, -nx, -ny, false);
  }

  // `s` is the special owner, `o` the other; vn > 0 when they approach
  preSolve2(c, s, o, vn, nx, ny, isPart) {
    const appr = Math.abs(vn);
    if (s.kind === 'screen') {
      if (s.broken) {
        c.setEnabled(false);
        return;
      }
      if (appr > 2.2) {
        s.broken = true;
        c.setEnabled(false);
        this.queue.push({ type: 'screen', ride: s.ride, x: this.phys.wm.points[0].x, y: this.phys.wm.points[0].y });
      } else if (appr > 0.8 && s.ride.glass === 'intact') {
        s.ride.glass = 'cracked';
        s.ride.crackT = this.phys.time;
      }
      return;
    }
    if (s.kind !== 'prop') return;
    const P = s.prop;
    if (P.broken) {
      c.setEnabled(false);
      return;
    }
    const t = P.t;
    if (t === 'glass') {
      if (appr > KINDS.glass.shatter && o.kind !== 'ground') {
        c.setEnabled(false);
        this.queue.push({ type: 'shatter', prop: P, x: this.phys.wm.points[0].x, y: this.phys.wm.points[0].y, by: o });
        P.broken = true;
      }
      return;
    }
    if (!isPart) {
      // a crate hit very hard by anything breaks at once
      if (P.breaks && appr > 11 && o.kind !== 'ground') {
        c.setEnabled(false);
        this.queue.push({ type: 'smash', prop: P, by: o, x: this.phys.wm.points[0].x, y: this.phys.wm.points[0].y });
      }
      return;
    }
    const time = this.phys.time;
    if (t === 'trampoline') {
      const top = P.body.getPosition().y + P.h / 2 - 0.2;
      if (this.phys.wm.points[0].y > top && appr > 0.5) {
        c.setEnabled(false);
        if (time - P.last > 0.25) {
          P.last = time;
          this.queue.push({ type: 'bounce', prop: P, vn: appr });
        }
      }
      return;
    }
    if (t === 'bumper') {
      c.setEnabled(false);
      if (time - P.last > 0.2) {
        P.last = time;
        this.queue.push({ type: 'kick', prop: P, part: o.part });
      }
      return;
    }
    if (P.breaks && appr > 8) {
      c.setEnabled(false);
      this.queue.push({ type: 'smash', prop: P, by: o, x: this.phys.wm.points[0].x, y: this.phys.wm.points[0].y });
    }
  }

  begin(a, b) {
    const s = a.kind === 'prop' ? a : b;
    const o = s === a ? b : a;
    if (s.kind !== 'prop' || o.kind !== 'part') return;
    const P = s.prop;
    if (P.hit) return;
    if (P.t === 'hoop') {
      P.hit = true;
      this.burning = 2.2;
      this.stunt('HOOP OF FIRE');
      const p = P.body.getPosition();
      this.events.push('hoop', p.x, p.y, 0, 0, 1, 'none', P);
    } else if (P.t === 'target') {
      P.hit = true;
      this.stunt('BULLSEYE');
      const p = P.body.getPosition();
      this.events.push('bullseye', p.x, p.y, 0, 0, 1, 'none', P);
    }
  }

  impactsAfter() {
    const B = this.phys.impacts;
    for (let i = 0; i < B.n; i++) {
      const a = B.a[i];
      const b = B.b[i];
      const imp = B.imp[i];
      if (a.kind === 'part') this.partHit(a.part, b, imp, B.x[i], B.y[i], -B.nx[i], -B.ny[i]);
      else if (b.kind === 'part') this.partHit(b.part, a, imp, B.x[i], B.y[i], B.nx[i], B.ny[i]);
      if (a.kind === 'prop') this.propHit(a.prop, b, imp, B.x[i], B.y[i]);
      if (b.kind === 'prop') this.propHit(b.prop, a, imp, B.x[i], B.y[i]);
      if ((a.kind === 'ride' || a.kind === 'wheel') && b.kind !== 'part' && imp > 300) this.events.push('clang', B.x[i], B.y[i], B.nx[i], B.ny[i], clamp(imp / 6000, 0.1, 1), b.mat, a.ride);
      else if ((b.kind === 'ride' || b.kind === 'wheel') && a.kind !== 'part' && imp > 300) this.events.push('clang', B.x[i], B.y[i], -B.nx[i], -B.ny[i], clamp(imp / 6000, 0.1, 1), a.mat, b.ride);
    }
  }

  // A part took a knock of `imp` N·s from `o`; (ox, oy) points out of the
  // surface he hit, the way the blood sprays.
  partHit(part, o, imp, x, y, ox, oy) {
    if (this.ride && this.ride.seated && (o.kind === 'ride' || o.kind === 'screen')) return;
    if (this.phase === 'aim') return;
    const S = this.score;
    const ph = this.phys;
    const dollars = S.hit(part, imp, ph.time);
    if (dollars <= 0) return;
    const s = clamp((imp - 10) / 320, 0, 1);
    const e = this.events.push('hit', x, y, ox, oy, s, o.mat, part);
    e.ref2 = o;
    this.replay.log(ph.time, 'hit', x, y, ox, oy, s, o.mat, part);
    if (imp > 60) this.painT = 0.8;
    if (!this.hitBefore && imp > 40) {
      this.hitBefore = true;
      if (!this.score.impact) this.score.impact = this.speedNow;
    }
    if (this.phase === 'flight' && !this.landed && this.flightT > 0.4 && imp > 30) {
      this.landed = true;
      if (part.id === 'head' && !this.headFirst) {
        this.headFirst = true;
        this.stunt(o.kind === 'ground' ? 'FACE PLANT' : 'HEAD FIRST');
      }
    }
    // broken bones
    const fr = FRACTURE[part.shape] * this.fracMul;
    if (imp > fr && part.fractured === 0 && !this.opts.god) {
      this.rag.fracture(part);
      S.fractures++;
      this.stunt(BONES[part.shape], Math.round(FRACTURE_PAY * part.mult));
      this.events.push('fracture', x, y, ox, oy, s, '', part);
    }
    if (imp > 200) this.rag.wear(part, clamp((imp - 200) / 450, 0, 1));
    if (part.id === 'head' && imp > KO_HIT && !this.ko && this.rag.conscious) {
      this.ko = true;
      this.rag.conscious = false;
      this.stunt('KNOCKED OUT');
    }
    if (imp > S.biggest) {
      S.biggest = imp;
      S.bigT = ph.time;
    }
    if (imp > BIG && imp > this.lastBig * 1.3 && ph.time - this.lastBigT > 1.4) {
      this.lastBig = imp;
      this.lastBigT = ph.time;
      this.events.push('big', x, y, ox, oy, clamp(imp / 600, 0.3, 1), o.mat, part);
    }
    if (o.kind === 'prop') {
      const P = o.prop;
      if (!P) return;
      const t = P.t;
      if ((t === 'sedan' || t === 'truck' || t === 'bus' || t === 'forklift') && imp > 25 && !P.hit) {
        P.hit = true;
        this.stunt('ROADKILL');
      } else if (t === 'wreckingball' && imp > 30 && !P.hit) {
        P.hit = true;
        this.stunt('WRECKING BALL');
      } else if (t === 'log' && imp > 30 && !P.hit) {
        P.hit = true;
        this.stunt('LOG SLAM');
      } else if (t === 'spikes' && imp > 8 && P.stuck < 3 && !part.stuck) {
        this.impale(P, part, x, y);
      } else if (t === 'tyres' && imp > 40 && ph.time - this.lastBounceT > 0.4) {
        this.lastBounceT = ph.time;
        this.stunt('BOUNCE');
      }
    }
  }

  propHit(P, o, imp, x, y) {
    if (!P || P.broken) return;
    if (P.explosive && imp > (o.kind === 'part' ? 40 : 90)) {
      this.ignite(P, o.kind === 'part' ? 0.04 : 0.02);
      return;
    }
    if (P.breaks && imp > P.breaks) this.smash(P, o, x, y);
    else if (imp > 25 && P.t !== 'plank') this.events.push('thud', x, y, 0, 0, clamp(imp / 400, 0.05, 1), P.mat, P);
  }

  // ------------------------------------------------------------ the props
  shatter(P, x, y, by) {
    removeProp(P);
    P.broken = true;
    const p = P.body.getPosition();
    this.events.push('glass', x, y, by && by.kind === 'part' ? Math.sign(by.part.body.getLinearVelocity().x) || 1 : 1, 0, P.h, 'glass', P);
    this.replay.log(this.phys.time, 'glass', x, y, 1, 0, P.h, 'glass', P);
    if (by && by.kind === 'part') {
      // the glass takes a little out of him
      const v = by.part.body.getLinearVelocity();
      this.tmp.x = v.x * 0.88;
      this.tmp.y = v.y * 0.88;
      by.part.body.setLinearVelocity(this.tmp);
      this.score.hit(by.part, 70, this.phys.time);
      this.stunt('THROUGH THE GLASS');
      this.events.push('cut', x, y, 0, 1, 0.6, 'glass', by.part);
    }
    return p;
  }

  screenOut(ride, x, y) {
    ride.glass = 'gone';
    ride.goneT = this.phys.time;
    const f = ride.screen;
    for (let fx = ride.chassis.getFixtureList(); fx; fx = fx.getNext()) if (fx.getUserData() === f) fx.setFilterData({ groupIndex: 0, categoryBits: CAT.SCREEN, maskBits: 0 });
    this.events.push('glass', x, y, 1, 0.3, 1.4, 'glass', ride);
    this.replay.log(this.phys.time, 'glass', x, y, 1, 0.3, 1.4, 'glass', ride);
    this.stunt('WINDSHIELD EXIT');
  }

  smash(P, by, x, y) {
    if (P.broken) return;
    if (P.explosive) {
      this.ignite(P, 0.02);
      return;
    }
    breakProp(this.phys, P, this.tmp);
    const p = P.body.getPosition();
    this.events.push('break', p.x, p.y, 0, 0, 1, P.mat, P);
    this.replay.log(this.phys.time, 'break', p.x, p.y, 0, 0, 1, P.mat, P);
    if (by && by.kind === 'part') {
      const name = P.t === 'snowman' ? 'SNOWMAN SMASH' : P.mat === 'glass' ? 'ICE BREAKER' : 'CRATE SMASH';
      this.stunt(name);
    }
  }

  ignite(P, delay) {
    if (P.broken || P.lit) return;
    P.lit = true;
    this.chain.push({ prop: P, t: this.phys.time + delay });
  }

  chains() {
    const c = this.chain;
    for (let i = c.length - 1; i >= 0; i--) {
      if (this.phys.time >= c[i].t) {
        const P = c[i].prop;
        c.splice(i, 1);
        this.explode(P);
      }
    }
  }

  explode(P) {
    if (P.broken) return;
    const p = P.body.getPosition();
    const x = p.x;
    const y = p.y;
    removeProp(P);
    const tnt = P.t === 'crate';
    const r = tnt ? 7 : 5.5;
    const power = tnt ? 30 : 24;
    let hitHim = false;
    const rag = this.rag;
    this.phys.blast(x, y, r, power, (body, dv, f) => {
      const o = body.getFixtureList()?.getUserData();
      if (!o) return;
      if (o.kind === 'part') {
        hitHim = true;
        const imp = f * (tnt ? 260 : 200);
        this.score.hit(o.part, imp);
        o.part.burnt = Math.min(1, o.part.burnt + f * 0.45);
        if (f > 0.7 && !this.opts.god) rag.wear(o.part, (f - 0.5) * 1.2);
      }
    });
    // explosives, crates and glass nearby go too
    for (const Q of this.props) {
      if (Q.broken || Q === P) continue;
      const q = Q.body.getPosition();
      const d = Math.hypot(q.x - x, q.y - y);
      if (d > r * 0.9) continue;
      if (Q.explosive) this.ignite(Q, 0.08 + d * 0.025);
      else if (Q.breaks) this.smash(Q, null, q.x, q.y);
      else if (Q.t === 'glass') this.shatter(Q, q.x, q.y, null);
    }
    this.events.push('explode', x, y, 0, 1, tnt ? 1 : 0.8, 'fire', P);
    this.replay.log(this.phys.time, 'explode', x, y, 0, 1, tnt ? 1 : 0.8, 'fire', P);
    if (hitHim) this.stunt(tnt ? 'KABOOM' : 'DRUM BOOM');
  }

  bounce(P, vn) {
    const v = clamp(vn * 1.05, P.t === 'trampoline' ? 10 : 7, 24);
    const rag = this.rag;
    for (const p of rag.parts) {
      if (!p.attached) continue;
      const u = p.body.getLinearVelocity();
      this.tmp.x = u.x * 0.95;
      this.tmp.y = Math.max(u.y, v);
      p.body.setLinearVelocity(this.tmp);
    }
    const q = P.body.getPosition();
    this.events.push('boing', q.x, q.y + P.h / 2, 0, 1, clamp(v / 20, 0.3, 1), 'rubber', P);
    this.replay.log(this.phys.time, 'boing', q.x, q.y + P.h / 2, 0, 1, clamp(v / 20, 0.3, 1), 'rubber', P);
    this.bounces++;
    this.stunt('BOUNCE', undefined, this.bounces > 1 ? 'BOUNCE x' + this.bounces : null);
    this.landed = false;
  }

  kick(P, part) {
    const c = P.body.getPosition();
    const p = part.body.getPosition();
    let dx = p.x - c.x;
    let dy = p.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const k = KINDS.bumper.kick;
    for (const q of this.rag.parts) {
      if (!q.attached) continue;
      const u = q.body.getLinearVelocity();
      const along = u.x * dx + u.y * dy;
      const add = Math.max(0, k - along);
      this.tmp.x = u.x + dx * add;
      this.tmp.y = u.y + dy * add;
      q.body.setLinearVelocity(this.tmp);
    }
    this.events.push('boing', c.x + dx * 0.5, c.y + dy * 0.5, dx, dy, 0.9, 'rubber', P);
    this.replay.log(this.phys.time, 'boing', c.x + dx * 0.5, c.y + dy * 0.5, dx, dy, 0.9, 'rubber', P);
    this.stunt('BUMPER');
    this.landed = false;
  }

  impale(P, part, x, y) {
    if (part.stuck || P.stuck >= 3) return;
    part.stuck = true;
    P.stuck++;
    this.impaled++;
    const b = part.body;
    this.tmp.x = 0;
    this.tmp.y = 0;
    b.setLinearVelocity(this.tmp);
    this.phys.world.createJoint(pl.WeldJoint({ frequencyHz: 4, dampingRatio: 0.5 }, P.body, b, b.getPosition()));
    this.score.hit(part, 140);
    this.events.push('impale', x, y, 0, 1, 1, 'metal', part);
    this.replay.log(this.phys.time, 'impale', x, y, 0, 1, 1, 'metal', part);
    if (!P.hit) {
      P.hit = true;
      this.stunt('SKEWERED');
    }
  }

  onTear(j) {
    const id = j.b.id;
    const rag = this.rag;
    const a = j.a.body.getWorldPoint(this.tmp.set(0, j.la));
    this.events.push('tear', a.x, a.y, 0, 1, 1, 'flesh', j);
    this.replay.log(this.phys.time, 'tear', a.x, a.y, 0, 1, 1, 'flesh', j);
    this.score.lost++;
    if (id === 'head' || id === 'neck') {
      if (!rag.byId.head.lostScored) {
        rag.byId.head.lostScored = true;
        this.stunt('HEADLESS');
      }
    } else if (id === 'uarmB' || id === 'uarmF') this.stunt('ARM RIPPED OFF', undefined, 'ARM RIPPED OFF');
    else if (id === 'ulegB' || id === 'ulegF') this.stunt('LEG RIPPED OFF', undefined, 'LEG RIPPED OFF');
    else if (id === 'larmB' || id === 'larmF') this.stunt('HAND GONE', undefined, 'FOREARM GONE');
    else if (id === 'llegB' || id === 'llegF') this.stunt('FOOT GONE', undefined, 'SHIN GONE');
    else if (id === 'chest') this.stunt('HEADLESS', 12000, 'TORN IN HALF');
  }

  stunt(name, amount, text) {
    const pay = this.score.stunt(name, amount, text);
    const e = this.events.push('stunt', 0, 0, 0, 0, 0, '', null);
    e.name = name;
    e.text = text || name;
    e.amount = pay;
    return pay;
  }

  // ----------------------------------------------------- water and lava
  fluids(dt) {
    const W = this.track.water;
    const lava = this.track.lava;
    let inW = false;
    let inL = false;
    const items = this.phys.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const b = it.body;
      if (!b.isDynamic() || !b.isActive()) continue;
      const p = b.getPosition();
      let top = 0;
      let kind = 0;
      if (W && p.x > W.x0 && p.x < W.x1 && p.y < W.y + 0.3) {
        top = W.y;
        kind = 1;
      } else if (lava) {
        for (let k = 0; k < lava.length; k++) {
          const L = lava[k];
          if (p.x > L.x0 && p.x < L.x1 && p.y < L.y + 0.3) {
            top = L.y;
            kind = 2;
          }
        }
      }
      if (!kind) continue;
      const depth = top - p.y;
      const sub = clamp((depth + 0.3) / 0.6, 0, 1);
      if (sub <= 0) continue;
      const m = b.getMass();
      this.tmp.x = 0;
      this.tmp.y = m * G * (kind === 1 ? 1.25 : 1.6) * sub;
      b.applyForceToCenter(this.tmp, true);
      const v = b.getLinearVelocity();
      const k = Math.exp(-(kind === 1 ? 2.4 : 4) * sub * dt);
      this.tmp.x = v.x * k;
      this.tmp.y = v.y * k;
      b.setLinearVelocity(this.tmp);
      b.setAngularVelocity(b.getAngularVelocity() * k);
      if (it.kind === 'part') {
        const part = it.ref;
        if (kind === 1) {
          inW = true;
          if (!this.inWater && Math.abs(v.y) > 4) {
            this.events.push('splash', p.x, top, 0, 1, clamp(Math.abs(v.y) / 20, 0.3, 1), 'water', part);
            this.replay.log(this.phys.time, 'splash', p.x, top, 0, 1, clamp(Math.abs(v.y) / 20, 0.3, 1), 'water', part);
            if (this.phase === 'flight') this.stunt('SPLASHDOWN');
          }
          this.inWater = true;
        } else {
          inL = true;
          part.burnt = Math.min(1, part.burnt + dt * 1.2);
          if (this.phase === 'flight') this.score.damage += 220 * dt * part.mult;
          if (!this.inLava) {
            this.events.push('sizzle', p.x, top, 0, 1, 1, 'lava', part);
            this.stunt('BARBECUE');
          }
          this.inLava = true;
        }
      } else if (it.kind === 'prop' && kind === 2 && it.ref.explosive) this.ignite(it.ref, 0.3);
    }
    if (!inW) this.inWater = false;
    if (inL) {
      this.lavaT += dt;
      if (this.lavaT > 1.2) this.rag.conscious = false;
    }
  }

  // traffic keeps its speed and loops round its stretch of road
  traffic() {
    for (const P of this.props) {
      if (!P.range) continue;
      const p = P.body.getPosition();
      const v = P.body.getLinearVelocity();
      if (v.x !== P.vx) {
        this.tmp.x = P.vx;
        this.tmp.y = v.y;
        P.body.setLinearVelocity(this.tmp);
      }
      if (P.vx > 0 && p.x > P.range[1]) this.teleport(P, P.range[0], p.y);
      else if (P.vx < 0 && p.x < P.range[0]) this.teleport(P, P.range[1], p.y);
    }
  }

  teleport(P, x, y) {
    this.tmp.x = x;
    this.tmp.y = y;
    P.body.setTransform(this.tmp, 0);
    this.phys.settle(P.item);
  }

  // ------------------------------------------------- airtime, flips, rest
  track3(dt) {
    const rag = this.rag;
    const ph = this.phys;
    const P = rag.pelvis.body;
    const v = P.getLinearVelocity();
    this.speedNow = Math.hypot(v.x, v.y);
    if (this.phase === 'drive' && this.ride) this.speedNow = this.ride.speed();
    if (this.speedNow > this.score.top) this.score.top = this.speedNow;
    if (this.painT > 0) this.painT -= dt;
    if (this.burning > 0) {
      this.burning -= dt;
      if ((ph.steps & 7) === 0) {
        const c = rag.chest.body.getPosition();
        this.events.push('burn', c.x, c.y, 0, 1, 0.6, 'fire', rag.chest);
      }
    }
    if (this.spreadT > 0) {
      this.spreadT -= dt;
      if (this.spreadT <= 0 && !this.hold) rag.control = 'limp';
    }
    // in the air: no part of him (or his ride) touching anything
    let touching = false;
    const s = ph.steps;
    if (this.phase === 'drive' && this.ride) touching = this.ride.grounded() || this.ride.owner.touch >= s - 1;
    else {
      for (const p of rag.parts) {
        if (p.attached && p.owner.touch >= s - 1) {
          touching = true;
          break;
        }
      }
    }
    if (!touching) {
      this.air += dt;
      if (this.phase === 'flight') {
        const a = rag.chest.body.getAngle();
        this.flip += a - this.lastA;
        this.lastA = a;
        const n = Math.floor((Math.abs(this.flip) + 0.6) / TAU);
        if (n > this.flips) {
          this.flips = n;
          const name = this.flip > 0 ? 'BACKFLIP' : 'FRONTFLIP';
          const pre = n === 1 ? '' : n === 2 ? 'DOUBLE ' : n === 3 ? 'TRIPLE ' : 'x' + n + ' ';
          this.stunt(name, 600 * n, pre + name);
        }
      }
    } else {
      if (this.air >= AIR_MIN) {
        const t = Math.round(this.air * 10) / 10;
        this.airTotal += t;
        this.stunt('AIRTIME', Math.round(t * 400), 'AIRTIME ' + t.toFixed(1) + 's');
      }
      this.air = 0;
      this.flip = 0;
      this.flips = 0;
      this.lastA = rag.chest.body.getAngle();
    }
    if (!this.snapped && rag.neckLoad() > SNAP_LOAD && this.phase === 'flight' && !this.opts.god) {
      this.snapped = true;
      rag.snapNeck();
      this.stunt('NECK SNAP');
      const h = rag.byId.neck.body.getPosition();
      this.events.push('snap', h.x, h.y, 0, 1, 1, 'flesh', rag.byId.neck);
    }
    if (this.phase === 'drive') {
      // a ride that has stopped with him still aboard tips him out
      if (ph.time - this.launchT > 2 && this.ride.speed() < 0.4) {
        this.still += dt;
        if (this.still > 1.2) {
          this.ride.eject(false, 0);
          this.startFlight();
          this.still = 0;
        }
      } else this.still = 0;
      return;
    }
    this.flightT += dt;
    const fell = P.getPosition().y < this.terrain.lo - 25;
    if (rag.speed() < STILL_SPEED) this.still += dt;
    else this.still = 0;
    if (this.still > STILL_TIME || this.flightT > MAX_FLIGHT || fell) this.finish();
  }

  finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.endT = this.phys.time;
    const px = this.rag.pelvis.body.getPosition().x;
    const d = Math.max(0, px - this.launchX);
    this.score.distance = d;
    if (d > 3) this.stunt('DISTANCE', Math.round(d * 30), 'DISTANCE ' + Math.round(d) + ' m');
    this.events.push('end', px, 0, 0, 0, 0, '', null);
  }

  // The best moment for the replay: around the hardest knock (or the end).
  bestWindow(out) {
    const r = this.replay;
    let t = this.score.bigT >= 0 ? this.score.bigT : r.last - 1;
    if (t < r.first || t > r.last) t = Math.max(r.first, r.last - 1.5);
    out.t0 = Math.max(r.first, t - 0.9);
    out.t1 = Math.min(r.last, t + 2.2);
    out.t = t;
    return out;
  }
}
