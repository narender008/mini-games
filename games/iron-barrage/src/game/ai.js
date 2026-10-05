// The computer commander. Each turn it looks at the field, picks a target,
// maybe uses a utility or repositions, picks a weapon with some sense, works
// out a firing solution by flying test shots through the same physics and
// wind (trajectory() in projectiles.js), then misses like a person: its range
// has an error that shrinks as it walks its shots onto the same target
// (bracketing), faster on harder levels, with a small floor that never goes
// away, a share of the wind it misjudges and, now and then, a slip.
//
// The turn is one generator (turn()) that update(dt) steps: it yields WORK
// between test shots (as many as fit in about 3 ms a frame) and FRAME when it
// is waiting for time to pass (thinking, driving, swinging the turret). The
// hot path (trajectory evaluation, the solver) allocates nothing. A watchdog
// fires whatever it has by 8 s, and any exception fires a rough shot, so a
// turn can never stall.
//
// What the battle gives it: Battle.begin() at the start of the tank's turn,
// update(dt) every frame in the 'aim' phase, then it sets tank.weapon,
// tank.aim, tank.power (and tank.driving to drive) and calls battle.fire().
import { WORLD, clamp, gauss, rand, DEG } from '../config.js';
import { WEAPONS, spent } from './weapons.js';
import { trajectory } from './projectiles.js';

// range: first-shot range error as a share of the distance (sigma); learn:
// what is left of the bracketing error after each shot at the same target;
// floor: share of `range` that never learns away; wind: share of the wind's
// drift it misjudges; slip: chance of a one-off bigger mistake; angle/power:
// hand tremor on the controls; think/pause: seconds; swing: turret speed
// (rad/s); sense: how often it picks the weapon the situation calls for;
// move: chance of repositioning for tactical reasons; arc: how randomly it
// picks between workable arcs.
export const LEVELS = {
  recruit: { name: 'Recruit', range: 0.53, learn: 0.88, floor: 0.35, wind: 0.5, slip: 0.2, angle: 1.0 * DEG, power: 0.012, think: 1.7, pause: 0.75, swing: 1.0, sense: 0.3, move: 0.05, arc: 3 },
  regular: { name: 'Regular', range: 0.3, learn: 0.7, floor: 0.35, wind: 0.3, slip: 0.14, angle: 0.6 * DEG, power: 0.008, think: 1.35, pause: 0.6, swing: 1.2, sense: 0.6, move: 0.16, arc: 1.5 },
  veteran: { name: 'Veteran', range: 0.19, learn: 0.5, floor: 0.3, wind: 0.14, slip: 0.1, angle: 0.35 * DEG, power: 0.005, think: 1.05, pause: 0.5, swing: 1.4, sense: 0.85, move: 0.3, arc: 0.6 },
  elite: { name: 'Elite', range: 0.12, learn: 0.4, floor: 0.25, wind: 0.05, slip: 0.08, angle: 0.15 * DEG, power: 0.003, think: 0.85, pause: 0.4, swing: 1.6, sense: 1, move: 0.45, arc: 0.2 },
};
export const LEVEL_IDS = Object.keys(LEVELS);

const WORK = 0;
const FRAME = 1;
const BUDGET_MS = 3; // most solver time in one frame
const HARD_LIMIT = 8; // seconds: fire whatever there is
const MAX_SOLS = 40;
const SPECIALS = ['heavy', 'cluster', 'napalm', 'airstrike', 'missile', 'buster', 'roller', 'sabot', 'nuke'];
const MAX_DRIVE = 2.2; // seconds a repositioning may take
const MAX_ESCAPE = 3.8; // and getting out of a fire

// One candidate firing solution (pooled).
class Sol {
  constructor() {
    this.set();
  }

  set() {
    this.elev = 0; // degrees above the horizon
    this.aim = 0; // world radians for tank.aim
    this.power = 0;
    this.err = 0; // landing minus aim point, along the firing direction (m)
    this.x = 0;
    this.y = 0;
    this.t = 0; // flight time (s)
    this.slope = 1; // landing metres per unit of power
    this.hit = false; // the flight touches the target tank
    this.ok = false;
    this.cost = 0;
    this.checked = false;
    this.safe = true;
  }

  copy(o) {
    this.elev = o.elev;
    this.aim = o.aim;
    this.power = o.power;
    this.err = o.err;
    this.x = o.x;
    this.y = o.y;
    this.t = o.t;
    this.slope = o.slope;
    this.hit = o.hit;
    this.ok = o.ok;
    this.cost = o.cost;
    this.safe = o.safe;
  }
}

// Power (0..1) that sends a shot from (mx, my) at launch elevation `elev`
// (radians above the horizon, towards the aim point) through (ax, ay), with
// gravity g and sideways wind acceleration `wind` along the firing direction.
// Closed form, ignoring the ground; -1 when there is no such shot.
function guessPower(mx, my, ax, ay, elev, dir, g, wind, vmax) {
  const s = Math.sin(elev);
  if (s < 0.02) return -1;
  const cot = Math.cos(elev) / s;
  const dxu = (ax - mx) * dir;
  const dy = ay - my;
  const den = 0.5 * (g * cot + wind);
  const num = dxu - dy * cot;
  if (den < 1e-4 || num <= 0) return -1;
  const T2 = num / den;
  const v = (dy + 0.5 * g * T2) / (Math.sqrt(T2) * s);
  if (!(v > 0)) return -1;
  return (v / vmax - 0.12) / 0.88;
}

export class Commander {
  constructor(battle, tank, level = 'regular') {
    this.b = battle;
    this.t = tank;
    this.level = Object.hasOwn(LEVELS, level) ? level : 'regular';
    this.L = LEVELS[this.level];
    this.memory = new Map(); // target id -> { bias, x, shots }
    this.threat = new Map(); // foe id -> damage it has done to us lately
    this.sols = [];
    for (let i = 0; i < MAX_SOLS; i++) this.sols.push(new Sol());
    this.n = 0;
    this.baseSol = new Sol(); // the best shell solution on the target
    this.specSol = new Sol(); // the best solution for the weapon it chose
    this.out = { x: 0, y: 0, tank: null, t: 0, apex: 0 };
    this.proxy = { gravK: 1, windK: 0, speedK: 1 }; // stands in for the homing missile's lob
    this.o = { w: null, tgt: null, dir: 1, ax: 0, ay: 0, min: 12, max: 82, step: 4, tol: 0.8, direct: false, flat: false, steep: false, windK: 1, gravK: 1, speedK: 1, safe: 8, safeX: 0 };
    this.sit = { dir: 1, dist: 0, covered: false, pit: 0, downhill: 0, hollow: false, open: true, group: 0, rim: 1, windN: 0 };
    this.plan = { weapon: WEAPONS.shell, aim: 0, power: 0.6, valid: false };
    this.target = null;
    this.baseOk = false;
    this.flatOk = false;
    this.hpSeen = tank.hp;
    this.hurtRecent = 0;
    this.foeX = NaN;
    this.mx = 0;
    this.my = 0;
    this.ma = 0;
    this.gen = null;
    this.dt = 1 / 60;
    this.clock = 0;
    this.moved = false;
    this.stage = 'idle';
    this.maxRange = (WORLD.maxSpeed * WORLD.maxSpeed * 0.92) / WORLD.gravity;
    this.last = null; // what it did last turn (for debugging and tests)
    this.perf = { ms: 0, worst: 0, frames: 0 };
  }

  // ------------------------------------------------------------ the turn
  begin() {
    const t = this.t;
    this.clock = 0;
    this.moved = false;
    this.perf.ms = 0;
    this.perf.worst = 0;
    this.perf.frames = 0;
    this.plan.valid = false;
    this.plan.weapon = WEAPONS.shell;
    t.driving = 0;
    this.stage = 'think';
    this.gen = this.turn();
  }

  update(dt) {
    const b = this.b;
    const t = this.t;
    if (!this.gen) {
      // the turn's script is over; if the shot somehow did not go, fire a plain shell
      if (!b.fired && b.phase === 'aim' && b.current() === t) this.emergency();
      return;
    }
    this.dt = dt;
    this.clock += dt;
    if (this.clock > HARD_LIMIT) {
      this.emergency();
      return;
    }
    const t0 = performance.now();
    try {
      for (;;) {
        const r = this.gen.next();
        if (r.done) {
          this.gen = null;
          this.stage = 'idle';
          break;
        }
        if (r.value !== WORK || performance.now() - t0 > BUDGET_MS) break;
      }
    } catch (e) {
      console.error('Commander', e);
      this.emergency();
    }
    const ms = performance.now() - t0;
    this.perf.ms += ms;
    this.perf.frames++;
    if (ms > this.perf.worst) this.perf.worst = ms;
  }

  *turn() {
    const L = this.L;
    const t = this.t;
    this.survey();
    if (!this.target) {
      yield* this.hold(0.5);
      yield* this.shoot();
      return;
    }
    let thinkEnd = L.think * rand(0.6, 1.1);
    // standing in burning fuel: get out first, think after
    if (t.fuel > 4 && t.grounded && this.fireNear(t.x)) {
      const goal = this.planMove('hazard');
      if (goal === goal) {
        this.stage = 'move';
        yield* this.drive(goal, MAX_ESCAPE);
        this.analyse();
        thinkEnd = this.clock + 0.35;
      }
    }
    this.stage = 'solve';
    yield* this.solveBase();
    this.stage = 'think';
    while (this.clock < thinkEnd) yield FRAME;
    if (!this.target.alive) {
      this.survey();
      if (!this.target) {
        yield* this.shoot();
        return;
      }
      yield* this.solveBase();
    }
    yield* this.utilities();
    // reposition?
    const why = this.moved ? null : this.moveReason();
    if (why) {
      const goal = this.planMove(why);
      if (goal === goal) {
        this.stage = 'move';
        yield* this.drive(goal);
        if (this.moved) {
          this.stage = 'solve';
          this.analyse();
          yield* this.solveBase();
        }
      }
    }
    // the weapon, and a solution for it
    let w = this.chooseWeapon();
    let sol = this.baseSol;
    if (w.id !== 'shell') {
      this.stage = 'solve';
      this.profile(w);
      yield* this.search();
      yield* this.pick(this.specSol);
      if (this.specSol.ok && this.specialSane(w)) sol = this.specSol;
      else w = WEAPONS.shell;
    }
    this.finalize(w, sol);
    yield* this.vet(w, sol);
    yield* this.swing();
    yield* this.shoot();
    this.last = { target: this.target.id, weapon: w.id, aim: this.plan.aim, power: this.plan.power, ok: sol.ok, moved: this.moved, t: this.clock };
  }

  // Sets the tank up and fires; falls back to a plain shell.
  *shoot() {
    const t = this.t;
    this.stage = 'fire';
    // a small pause before the shot, but never past 7 s into the turn
    yield* this.hold(Math.min(this.L.pause * rand(0.7, 1.3), Math.max(0.1, 7 - this.clock)));
    const p = this.plan;
    t.driving = 0;
    if (p.valid) {
      t.setAim(p.aim);
      t.power = p.power;
      t.weapon = p.weapon.id;
    }
    if (!this.b.fire(t)) {
      t.weapon = 'shell';
      this.b.fire(t);
    }
  }

  // The watchdog or an error: fire now with whatever there is.
  emergency() {
    const t = this.t;
    const b = this.b;
    this.gen = null;
    this.stage = 'idle';
    t.driving = 0;
    const p = this.plan;
    if (p.valid) {
      t.setAim(p.aim);
      t.power = p.power;
      t.weapon = p.weapon.id;
    } else {
      const foes = b.enemies(t);
      let f = foes[0];
      for (const o of foes) if (Math.abs(o.x - t.x) < Math.abs(f.x - t.x)) f = o;
      if (f) {
        const dir = Math.sign(f.x - t.x) || 1;
        const R = Math.abs(f.x - t.x);
        const v = Math.sqrt(R * WORLD.gravity);
        t.setAim(dir > 0 ? Math.PI / 4 : (Math.PI * 3) / 4);
        t.power = clamp((v / (WORLD.maxSpeed * t.gunBonus) - 0.12) / 0.88, 0.1, 1);
      }
      t.weapon = 'shell';
    }
    if (!b.fire(t)) {
      t.weapon = 'shell';
      b.fire(t);
    }
  }

  *hold(sec) {
    const end = this.clock + sec;
    while (this.clock < end) yield FRAME;
  }

  // ------------------------------------------------------------ looking
  // Who has been hurting us, who to shoot at.
  survey() {
    const t = this.t;
    const b = this.b;
    const foes = b.enemies(t);
    const drop = this.hpSeen - t.hp;
    this.hpSeen = t.hp;
    this.hurtRecent = this.hurtRecent * 0.5 + (drop > 0 ? drop / t.maxHp : 0);
    this.foeX = NaN;
    let nearest = null;
    let nd = 40;
    for (const f of foes) {
      const li = f.lastImpact;
      if (!li) continue;
      const d = Math.abs(li.x - t.x);
      if (d < nd) {
        nd = d;
        nearest = f;
      }
    }
    if (nearest) {
      this.foeX = nearest.lastImpact.x;
      if (drop > 0) this.threat.set(nearest.id, (this.threat.get(nearest.id) || 0) * 0.6 + drop);
    }
    this.target = null;
    let best = -Infinity;
    for (const f of foes) {
      const d = Math.abs(f.x - t.x);
      let s = (this.threat.get(f.id) || 0) * 0.6 + (1 - f.hp / f.maxHp) * 28 - d * 0.06;
      s += d < this.maxRange ? 14 : -10;
      if (f.hp <= 32) s += 18;
      if (this.last && this.last.target === f.id) s += 10; // stay on a target once bracketed
      s += rand(0, 8 * (1 - this.L.sense) + 1);
      if (s > best) {
        best = s;
        this.target = f;
      }
    }
    if (this.target) this.analyse();
  }

  // Cheap facts about the ground round the target.
  analyse() {
    const t = this.t;
    const tg = this.target;
    const T = this.b.terrain;
    const s = this.sit;
    const dir = Math.sign(tg.x - t.x) || 1;
    s.dir = dir;
    s.dist = Math.abs(tg.x - t.x);
    s.windN = Math.abs(this.b.wind);
    const top = T.top(tg.x);
    s.covered = top - (tg.y + tg.hgt) > 3;
    const near = T.top(tg.x - dir * 8); // the rim on our side
    const far = T.top(tg.x + dir * 8);
    s.pit = Math.max(0, Math.min(near, far) - tg.y);
    s.downhill = Math.max(0, near - tg.y);
    s.rim = far > near ? dir : -dir; // which way is uphill from the target (world sign)
    s.hollow = s.pit >= 2.5 || s.downhill >= 4;
    s.open = !s.covered && s.pit < 1.8 && s.downhill < 3;
    let g = 0;
    for (const f of this.b.enemies(t)) if (f !== tg && Math.abs(f.x - tg.x) < 26) g++;
    s.group = g;
  }

  // Expected miss (sigma, metres) of the next shot at the target.
  sigma() {
    const m = this.memFor(this.target);
    const R = Math.max(10, this.sit.dist);
    return R * Math.hypot(m.bias, this.L.range * this.L.floor);
  }

  // What it remembers about aiming at this target; it forgets when the
  // target has moved.
  memFor(tg) {
    let m = this.memory.get(tg.id);
    if (!m) {
      m = { bias: 0, x: tg.x, shots: 0 };
      m.bias = gauss() * this.L.range;
      this.memory.set(tg.id, m);
    } else {
      const moved = Math.abs(tg.x - m.x);
      if (moved > 4.5) {
        // it has to judge the range again: all the way back for a big move
        const f = clamp(0.45 + moved / 40, 0.45, 1);
        m.bias = gauss() * this.L.range * f;
        m.x = tg.x;
        m.shots = 0;
      }
    }
    return m;
  }

  // ------------------------------------------------------------ the solver
  // Where the muzzle is when the gun points at `aim` (world radians), and
  // the aim the mounting really allows. Leaves the tank as it was.
  muzzle(aim) {
    const t = this.t;
    const sa = t.aim;
    const sf = t.facing;
    t.setAim(aim);
    t.pose();
    this.mx = t.muzzleX;
    this.my = t.muzzleY;
    this.ma = t.aim;
    t.aim = sa;
    t.facing = sf;
    t.pose();
  }

  // Fills this.o for weapon w against the current target.
  profile(w) {
    const o = this.o;
    const s = this.sit;
    const tg = this.target;
    const T = this.b.terrain;
    o.w = w;
    o.tgt = tg;
    o.dir = s.dir;
    o.direct = false;
    o.flat = false;
    o.steep = false;
    o.min = 12;
    o.max = 82;
    o.step = 4;
    o.tol = 0.8;
    o.ax = tg.x;
    o.ay = tg.y + tg.hgt * 0.45;
    o.windK = w.windK ?? 1;
    o.gravK = w.gravK ?? 1;
    o.speedK = w.speedK ?? 1;
    o.safe = (w.blast || 6) * 0.8 + 0.8;
    o.safeX = 0;
    switch (w.id) {
      case 'sabot':
        o.direct = true;
        o.flat = true;
        o.min = 2;
        o.max = 40;
        o.step = 2.5;
        o.tol = 0.5;
        break;
      case 'napalm':
        // the fire runs downhill: land a little uphill of a tank in a hollow
        if (s.hollow) {
          o.ax = tg.x + s.rim * 3.5;
          o.ay = T.top(o.ax) + 0.4;
        }
        o.steep = true;
        o.safe = 15;
        break;
      case 'airstrike':
        // the jet bombs a 24 m line centred on the marker: it only has to land near
        o.tol = 6;
        o.safeX = 28;
        break;
      case 'missile':
        // it steers itself in: lob it high with no wind and let it find the hull
        this.proxy.speedK = w.speedK ?? 1;
        o.w = this.proxy;
        o.windK = 0;
        o.gravK = 1;
        o.min = 52;
        o.max = 80;
        o.step = 4;
        o.tol = 12;
        o.safe = 0;
        break;
      case 'buster':
        o.steep = true;
        o.tol = 2.5;
        break;
      case 'roller':
        // land short of the target, on its side of the hill, and let it roll
        o.ax = tg.x - s.dir * (s.pit >= 2.5 ? 7 : 10);
        o.ay = T.top(o.ax) + 0.4;
        o.tol = 1.2;
        break;
      case 'nuke':
        o.tol = 3;
        o.safeX = 44;
        break;
      case 'cluster':
        o.tol = 1.5;
        break;
      default:
        break;
    }
  }

  // Is a shot landing at (x, y) safe for us and our friends?
  landingSafe(x, y) {
    const o = this.o;
    const tanks = this.b.tanks;
    const team = this.t.team;
    for (let i = 0; i < tanks.length; i++) {
      const k = tanks[i];
      if (!k.alive || k.team !== team) continue;
      if (o.safeX > 0) {
        if (Math.abs(k.x - x) < o.safeX) return false;
      } else if (o.safe > 0 && k.distance(x, y) < o.safe) return false;
    }
    return true;
  }

  // Landing metres per unit of power, roughly (range goes with speed squared).
  estSlope(p, range) {
    return (2 * Math.max(10, range) * 0.88) / (0.12 + 0.88 * p);
  }

  // Tests shots at a ladder of elevations and keeps what it finds in this.sols.
  *search() {
    const t = this.t;
    const b = this.b;
    const o = this.o;
    const out = this.out;
    const tgt = o.tgt;
    const dir = o.dir;
    const g = WORLD.gravity * o.gravK;
    const wind = b.windAcc() * o.windK * dir;
    const vmax = WORLD.maxSpeed * o.speedK * t.gunBonus;
    this.n = 0;
    for (let e = o.min; e <= o.max + 0.01; e += o.step) {
      if (this.n >= MAX_SOLS) break;
      this.muzzle(dir > 0 ? e * DEG : Math.PI - e * DEG);
      const mx = this.mx;
      const my = this.my;
      const ma = this.ma;
      const ca = Math.cos(ma);
      const sa = Math.sin(ma);
      const elevA = dir > 0 ? ma : Math.PI - ma; // what the mounting allows
      let p = guessPower(mx, my, o.ax, o.ay, elevA, dir, g, wind, vmax);
      if (!(p > 0.02 && p < 1.15)) continue;
      p = clamp(p, 0.05, 1);
      let lo = 0.05;
      let hi = 1;
      let hasLo = false;
      let hasHi = false;
      let pPrev = -1;
      let pSim = p; // the last power actually simulated: what err, out and hit belong to
      let ePrev = 0;
      let prevTerr = false;
      let slope = 0;
      let ok = false;
      let bad = false;
      let err = 0;
      let hit = false;
      for (let it = 0; it < 6; it++) {
        const sp = vmax * (0.12 + 0.88 * p);
        trajectory(b, t, mx, my, ca * sp, sa * sp, o.w, out);
        pSim = p;
        yield WORK;
        const tk = out.tank;
        if (tk && tk !== tgt && tk.alive && tk.team === t.team) {
          bad = true; // a friend in the way
          break;
        }
        hit = tk === tgt;
        err = hit ? 0 : (out.x - o.ax) * dir;
        if (pPrev >= 0 && !hit && prevTerr && Math.abs(p - pPrev) > 1e-6) {
          const sl = (err - ePrev) / (p - pPrev);
          if (sl > 0) slope = sl;
        }
        if (Math.abs(err) <= o.tol) {
          ok = true;
          break;
        }
        if (err < 0) {
          lo = p;
          hasLo = true;
        } else {
          hi = p;
          hasHi = true;
        }
        if ((p >= 0.999 && err < 0) || (p <= 0.051 && err > 0)) break; // out of reach at this elevation
        const sl = slope > 0 ? slope : this.estSlope(p, Math.abs(out.x - mx));
        let pn = p - err / sl;
        if (hasLo && hasHi && (pn <= lo || pn >= hi)) pn = (lo + hi) / 2;
        pPrev = p;
        ePrev = err;
        prevTerr = !hit;
        p = clamp(pn, 0.05, 1);
        if (Math.abs(p - pPrev) < 1e-4) break;
      }
      if (bad) continue;
      p = pSim; // a loop that ran out leaves p at the next, untested guess
      if (o.direct && !hit) ok = false;
      const safe = this.landingSafe(out.x, out.y);
      if (!safe) ok = false;
      // a direct hit that grazes the hull: nudge it onto the middle
      if (ok && hit && Math.abs(out.x - o.ax) > 1.2) {
        const off = (out.x - o.ax) * dir;
        const sl = slope > 0 ? slope : this.estSlope(p, Math.abs(o.ax - mx));
        const pn = clamp(p - off / sl, 0.05, 1);
        const sp = vmax * (0.12 + 0.88 * pn);
        const ox = out.x;
        const oy = out.y;
        const ot = out.t;
        trajectory(b, t, mx, my, ca * sp, sa * sp, o.w, out);
        yield WORK;
        if (out.tank === tgt && Math.abs(out.x - o.ax) < Math.abs(off)) p = pn;
        else {
          out.x = ox;
          out.y = oy;
          out.t = ot;
        }
      }
      const s = this.sols[this.n++];
      s.elev = e;
      s.aim = ma;
      s.power = p;
      s.err = err;
      s.x = out.x;
      s.y = out.y;
      s.t = out.t;
      s.hit = hit;
      s.ok = ok;
      s.safe = safe;
      const est = this.estSlope(p, Math.abs(o.ax - mx));
      s.slope = slope > est * 0.3 && slope < est * 3 ? slope : est;
    }
  }

  // Chooses among the workable arcs: short flights (the wind and a moving
  // target matter less), room to spare on power, a clear lob over ridges,
  // steep where the target is dug in, flat for a dart. Copies the winner (or
  // the nearest miss) into dest.
  *pick(dest) {
    const o = this.o;
    const L = this.L;
    const sols = this.sols;
    const n = this.n;
    let flat = false;
    for (let i = 0; i < n; i++) {
      const s = sols[i];
      if (!s.ok) {
        s.cost = 1e9;
        continue;
      }
      if (s.elev <= 40) flat = true;
      let c = s.t * 0.55 + (s.power > 0.95 ? 1.2 : 0) + rand(0, L.arc);
      if (o.steep) c += ((82 - s.elev) / 82) * 5;
      if (o.flat) c += (s.elev / 40) * 2;
      s.cost = c;
    }
    if (o.w === this.baseWeapon) this.flatOk = flat;
    // is the best of them robust: does it still land close at 2.5% more or less power?
    for (let round = 0; round < 3; round++) {
      let bi = -1;
      let bc = 1e8;
      for (let i = 0; i < n; i++) if (sols[i].cost < bc && !sols[i].checked) {
        bc = sols[i].cost;
        bi = i;
      }
      if (bi < 0) break;
      const s = sols[bi];
      s.checked = true;
      s.cost += yield* this.robust(s);
    }
    let best = null;
    let bc = 1e8;
    for (let i = 0; i < n; i++) {
      const s = sols[i];
      s.checked = false;
      if (s.ok && s.cost < bc) {
        bc = s.cost;
        best = s;
      }
    }
    if (best) {
      dest.copy(best);
      dest.ok = true;
      return;
    }
    // no workable shot: the nearest miss (the ridge in front of it, say)
    let ne = 1e8;
    for (let i = 0; i < n; i++) {
      const s = sols[i];
      if (s.safe && Math.abs(s.err) < ne) {
        ne = Math.abs(s.err);
        best = s;
      }
    }
    if (best) {
      dest.copy(best);
      dest.ok = false;
      return;
    }
    // nothing reaches at all: a lob at full power, in the right direction
    this.muzzle(o.dir > 0 ? 45 * DEG : Math.PI - 45 * DEG);
    dest.set();
    dest.elev = 45;
    dest.aim = this.ma;
    dest.power = 1;
    dest.slope = this.estSlope(1, 100);
    dest.t = 5;
    dest.ok = false;
  }

  // Extra cost for a shot that only just clears a ridge or sits on a knife edge.
  *robust(s) {
    const t = this.t;
    const o = this.o;
    const out = this.out;
    const vmax = WORLD.maxSpeed * o.speedK * t.gunBonus;
    this.muzzle(o.dir > 0 ? s.elev * DEG : Math.PI - s.elev * DEG);
    const ca = Math.cos(this.ma);
    const sa = Math.sin(this.ma);
    let pen = 0;
    for (let k = -1; k <= 1; k += 2) {
      const p = clamp(s.power * (1 + 0.025 * k), 0.05, 1);
      const sp = vmax * (0.12 + 0.88 * p);
      trajectory(this.b, t, this.mx, this.my, ca * sp, sa * sp, o.w, out);
      yield WORK;
      const e = out.tank === o.tgt ? 0 : Math.abs((out.x - o.ax) * o.dir);
      // a shot that is a few metres out after a 2.5% change is a sound one; much more means a ridge or a cliff
      const range = Math.max(20, Math.abs(o.ax - this.mx));
      pen += clamp((e - range * 0.07) * 0.08, 0, 3);
    }
    return pen;
  }

  *solveBase() {
    const w = WEAPONS.shell;
    this.baseWeapon = w;
    this.profile(w);
    yield* this.search();
    yield* this.pick(this.baseSol);
    this.baseOk = this.baseSol.ok;
  }

  // ------------------------------------------------------------ weapons
  has(id) {
    const w = WEAPONS[id];
    if (!w || !(this.t.inventory[id] > 0)) return false;
    if (spent(this.t, id)) return false; // the Sunburst: one a battle
    return true;
  }

  // How much the situation calls for each weapon; shell is 1.
  desire(id, w) {
    const tg = this.target;
    const s = this.sit;
    const lvl = this.level;
    const sig = this.sigma();
    const hpLeft = tg.hp;
    const rangeOk = (min) => s.dist >= (min || 0);
    switch (id) {
      case 'heavy': {
        let v = 0.55;
        if (sig < 6) v += 0.9;
        if (s.windN > 0.5) v += 0.7;
        if (hpLeft <= w.damage * (1 - tg.armour)) v += 0.9;
        return v;
      }
      case 'cluster': {
        if (!rangeOk(w.ai?.minRange || 35)) return -9;
        return s.open ? 0.9 + (s.group ? 0.6 : 0) + (hpLeft > 50 ? 0.3 : 0) : 0.1;
      }
      case 'napalm':
        if (!rangeOk(22)) return -9;
        return s.hollow ? 1.9 : s.open && hpLeft > 45 ? 0.35 : -0.2;
      case 'airstrike': {
        if (!rangeOk(45)) return -9;
        return 0.45 + (!this.baseOk ? 1.6 : 0) + (s.open ? 0.9 : 0) + (s.group ? 0.8 : 0) + (hpLeft > 60 ? 0.2 : 0);
      }
      case 'missile': {
        if (!rangeOk(w.ai?.minRange || 30)) return -9;
        let v = 0.4;
        if (s.windN > 0.5) v += 1.3;
        if (!this.baseOk || this.baseSol.power > 0.97) v += 1.2; // hard to reach: blocked, or at the limit of the gun
        return v;
      }
      case 'buster':
        return s.covered ? 2.6 : s.pit >= 3 ? 1.7 : -0.3;
      case 'roller':
        return s.downhill >= 3.5 ? 2.2 : s.pit >= 2.5 ? 1.0 : -0.1;
      case 'sabot': {
        // only a direct hit counts: worth it when the aim is good and the line is clear
        if (!this.flatOk || sig > 6.5) return -9;
        return 1.7 + (s.windN > 0.45 ? 0.5 : 0) + (lvl === 'elite' ? 0.3 : 0);
      }
      case 'nuke':
        return this.nukeValue(w);
      default:
        return -9;
    }
  }

  // The Sunburst, a finisher: only veterans and elites, never within reach of
  // itself or a friend, and only when it ends the battle, kills the target or
  // catches two tanks.
  nukeValue(w) {
    if (this.level !== 'veteran' && this.level !== 'elite') return -9;
    const t = this.t;
    const tg = this.target;
    const tanks = this.b.tanks;
    let kills = 0;
    let foes = 0;
    let hurt = 0;
    for (const k of tanks) {
      if (!k.alive) continue;
      const d = Math.abs(k.x - tg.x);
      if (k.team === t.team) {
        if (d < w.blast * 1.35) return -9; // a friend (or us) in reach
        continue;
      }
      foes++;
      if (d >= w.blast) continue;
      const dmg = w.damage * Math.pow(1 - d / w.blast, 1.4) * (1 - k.armour);
      hurt++;
      if (dmg >= k.hp * 0.9) kills++;
    }
    // a finisher: not against a tank that has hardly been scratched, early in the battle
    const worn = tg.hp <= tg.maxHp * 0.8 || this.b.round >= 4;
    if (kills > 0 && kills === foes && worn) return 4.5; // wins the battle
    if (hurt >= 2 && (worn || this.b.round >= 2)) return 3.2;
    return -9;
  }

  // The weapon for this turn: the situation says what it wants, its sense
  // says how often it listens, a little thrift keeps the special rounds for
  // when they count.
  chooseWeapon() {
    const L = this.L;
    let bestId = 'shell';
    let bestV = 1.05 + rand(0, 0.15);
    const wild = (1 - L.sense) * 2.4;
    for (let i = 0; i < SPECIALS.length; i++) {
      const id = SPECIALS[i];
      if (!this.has(id) || WEAPONS[id].utility) continue;
      const d = this.desire(id, WEAPONS[id]);
      if (d <= -5) {
        // forbidden by the situation; only a muddled recruit tries it anyway
        if (id === 'nuke' || L.sense > 0.5) continue;
        if (Math.random() > 0.25) continue;
      }
      const v = d - 0.2 + rand(0, wild);
      if (v > bestV) {
        bestV = v;
        bestId = id;
      }
    }
    return WEAPONS[bestId];
  }

  // After solving for a special weapon: is the shot worth it?
  specialSane(w) {
    const s = this.specSol;
    if (!s.ok) return false;
    if (w.id === 'nuke' || w.id === 'airstrike') return true;
    if (w.id === 'missile') return this.sit.dist >= 30;
    return true;
  }

  // ------------------------------------------------------------ the error
  // Turns the solution into what it actually sets on the gun.
  finalize(w, sol) {
    const tg = this.target;
    const p = this.plan;
    this.shape(w, sol, 1);
    // it has fired at this target: what it knew is a little better
    const m = this.memFor(tg);
    m.bias *= this.L.learn;
    m.shots++;
    m.x = tg.x;
    p.weapon = w;
    p.valid = true;
  }

  // Sets plan.aim and plan.power: the solution plus this shot's error
  // (scaled by `k`, which a re-aim after a bad look takes down).
  shape(w, sol, k) {
    const L = this.L;
    const tg = this.target;
    const t = this.t;
    const p = this.plan;
    const R = Math.max(10, Math.abs(tg.x - t.x));
    const m = this.memFor(tg);
    // the range error: what it has left to learn, plus the floor
    let dx = (m.bias + gauss() * L.range * L.floor) * R;
    if (Math.random() < L.slip) dx += (Math.random() < 0.5 ? -1 : 1) * rand(5, 11);
    // the wind: it misjudges some share of the drift, less as it learns the range
    const drift = 0.5 * this.b.windAcc() * (w.windK ?? 1) * sol.t * sol.t;
    const learnt = L.range > 0 ? clamp(Math.abs(m.bias) / L.range, 0, 1) : 0;
    dx += gauss() * L.wind * (0.5 + 0.5 * learnt) * Math.abs(drift);
    if (w.id === 'missile') dx *= 0.35; // it steers itself in
    else if (w.id === 'airstrike') dx *= 0.8;
    dx *= k;
    let power = sol.power + dx / sol.slope + gauss() * L.power * (0.4 + 0.6 * learnt) * k;
    let aim = sol.aim + gauss() * L.angle * (0.4 + 0.6 * learnt) * k;
    if (!(power > 0) || !(aim === aim)) {
      power = sol.power;
      aim = sol.aim;
    }
    // a gun cannot throw further than full charge: an error that would have
    // carried it past that comes up short by the same amount instead
    if (power > 1) power = 1 - (power - 1);
    // the numbers on the readout are whole and half: round like a gunner would
    p.power = clamp(Math.round(power * 200) / 200, 0.05, 1);
    p.aim = clamp(Math.round(aim / (0.25 * DEG)) * 0.25 * DEG, 0, Math.PI);
  }

  // A last look down the barrel: where will this shot really come down? If
  // it would catch a friend or itself, it takes its time and aims truer.
  *vet(w, sol) {
    if (w.id === 'missile') return;
    const t = this.t;
    const p = this.plan;
    const out = this.out;
    this.profile(w);
    const o = this.o;
    const vmax = WORLD.maxSpeed * o.speedK * t.gunBonus;
    for (let tries = 0; tries < 3; tries++) {
      this.muzzle(p.aim);
      const sp = vmax * (0.12 + 0.88 * p.power);
      trajectory(this.b, t, this.mx, this.my, Math.cos(this.ma) * sp, Math.sin(this.ma) * sp, o.w, out);
      yield WORK;
      const tk = out.tank;
      const friend = tk && tk.alive && tk.team === t.team;
      if (!friend && this.landingSafe(out.x, out.y)) return;
      this.shape(w, sol, tries === 0 ? 0.35 : 0);
    }
  }

  // Swing the turret and set the charge at a human pace, slowing as it settles.
  *swing() {
    const t = this.t;
    const p = this.plan;
    const L = this.L;
    this.stage = 'aim';
    t.weapon = p.weapon.id;
    let tm = 0;
    for (;;) {
      const da = p.aim - t.aim;
      const dp = p.power - t.power;
      if ((Math.abs(da) < 0.003 && Math.abs(dp) < 0.003) || tm > 2 || this.clock > 6.4) break;
      // running late in the turn: a quicker hand
      const k = this.clock > 4.5 ? 1 + (this.clock - 4.5) : 1;
      const sa = clamp(Math.abs(da) * 4.5, 0.2, L.swing * 1.3) * this.dt * k;
      const sp = clamp(Math.abs(dp) * 4, 0.12, 0.9) * this.dt * k;
      t.setAim(t.aim + clamp(da, -sa, sa));
      t.power += clamp(dp, -sp, sp);
      yield FRAME;
      tm += this.dt;
    }
    t.setAim(p.aim);
    t.power = p.power;
  }

  // ------------------------------------------------------------ utilities
  *utilities() {
    const t = this.t;
    const L = this.L;
    const inv = t.inventory;
    const smart = Math.random() < L.sense + 0.15;
    if (inv.repair > 0 && t.hp < t.maxHp * 0.4 && smart) {
      if (this.use('repair')) yield* this.hold(this.clock < 4 ? 0.55 : 0.1);
    }
    if (inv.shield > 0 && t.shield < 10 && smart && (t.hp < t.maxHp * 0.8 || this.hurtRecent > 0.05 || Math.random() < 0.25)) {
      if (yield* this.exposed()) {
        if (this.use('shield')) yield* this.hold(this.clock < 4 ? 0.55 : 0.1);
      }
    }
    if (inv.chute > 0 && !t.chute && smart && this.nearEdge()) {
      if (this.use('chute')) yield* this.hold(this.clock < 4 ? 0.4 : 0.1);
    }
  }

  use(id) {
    const t = this.t;
    const before = t.inventory[id];
    t.weapon = id;
    this.b.fire(t); // a utility does not end the turn
    t.weapon = 'shell';
    this.hpSeen = t.hp;
    return t.inventory[id] < before;
  }

  // Could an enemy put a shell on us from where it stands?
  *exposed() {
    const me = this.t;
    const b = this.b;
    const foes = b.enemies(me);
    const out = this.out;
    const g = WORLD.gravity;
    const wind = b.windAcc();
    for (const f of foes) {
      const dir = Math.sign(me.x - f.x) || 1;
      const vmax = WORLD.maxSpeed * f.gunBonus;
      const ay = me.y + me.hgt * 0.45;
      for (let k = 0; k < 3; k++) {
        const elev = (30 + k * 20) * DEG;
        const mx = f.x + dir * Math.cos(elev) * 3.4;
        const my = f.y + 2.1 + Math.sin(elev) * 3.4;
        const p = guessPower(mx, my, me.x, ay, elev, dir, g, wind * dir, vmax);
        if (!(p > 0.05 && p < 1)) continue;
        const sp = vmax * (0.12 + 0.88 * p);
        trajectory(b, f, mx, my, Math.cos(elev) * dir * sp, Math.sin(elev) * sp, WEAPONS.shell, out);
        yield WORK;
        if (out.tank === me || Math.abs(out.x - me.x) < 5) return true;
      }
    }
    return false;
  }

  // Standing at the lip of a drop (a crater's edge, a cliff)?
  nearEdge() {
    const t = this.t;
    const T = this.b.terrain;
    for (let d = -6; d <= 6; d += 3) {
      if (d === 0) continue;
      if (T.groundBelow(t.x + d, t.y + 6) < t.y - 4.5) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ moving
  // How far inside burning fuel (or the margin round it) x is: 0 when clear.
  fireDepth(x) {
    const hz = this.b.hazards;
    if (!hz || !hz.fires) return 0;
    let d = 0;
    for (let i = 0; i < hz.fires.length; i++) {
      const f = hz.fires[i];
      if (f.dying > 2) continue;
      const inside = Math.min(x - (f.x0 - 5), f.x1 + 5 - x);
      if (inside > d) d = inside;
    }
    return d;
  }

  fireNear(x) {
    return this.fireDepth(x) > 0;
  }

  moveReason() {
    const t = this.t;
    const L = this.L;
    if (t.fuel < 4 || !t.grounded) return null;
    const T = this.b.terrain;
    const pit = Math.min(T.top(t.x - 7), T.top(t.x + 7)) - t.y;
    if (pit > 2.8) return 'pit';
    if (!this.baseOk) return 'blocked';
    if (this.hurtRecent > 0.2 && Math.random() < 0.35 + L.move) return 'hurt';
    if (Math.random() < L.move * (this.baseSol.power > 0.93 ? 1.6 : 1)) return 'tactical';
    return null;
  }

  // How good a place to stand is x, for the target.
  positionScore(xc) {
    const T = this.b.terrain;
    const t = this.t;
    const tg = this.target;
    const g = T.groundBelow(xc, t.y + 6);
    let s = 0;
    const rl = T.groundBelow(xc - 7, g + 8);
    const rr = T.groundBelow(xc + 7, g + 8);
    s -= Math.max(0, Math.min(rl, rr) - g) * 2.2; // in a pit
    const slope = Math.abs(rr - rl) / 14;
    if (slope > 0.62) s -= (slope - 0.62) * 12; // steep enough to slide
    const R = Math.abs(tg.x - xc);
    // the line to the target: a ridge across it blocks a flat shot (a lob may still clear it)
    const y0 = g + 2.4;
    const y1 = tg.y + tg.hgt * 0.5;
    let ridge = 0;
    for (let k = 1; k < 12; k++) {
      const f = k / 12;
      const x = xc + (tg.x - xc) * f;
      const over = T.top(x) - (y0 + (y1 - y0) * f);
      if (over > ridge) ridge = over;
    }
    s -= Math.min(ridge, 30) * (R > 60 ? 0.27 : 0.45);
    if (R > this.maxRange) s -= (R - this.maxRange) * 0.5;
    else if (R > this.maxRange * 0.9) s -= (R - this.maxRange * 0.9) * 0.2;
    if (R < 40) s -= (40 - R) * 0.35;
    s += clamp(g - tg.y, -12, 12) * 0.12;
    if (xc < 14 || xc > WORLD.width - 14) s -= 6;
    const fd = this.fireDepth(xc);
    if (fd > 0) s -= 4 + fd * 1.5;
    if (this.foeX === this.foeX) {
      const d = Math.abs(xc - this.foeX);
      if (d < 12) s -= (12 - d) * 0.3 * (1 + this.hurtRecent * 3);
    }
    return s;
  }

  // How far it can drive one way without a ledge, a crater or a wall.
  pathLimit(dir, reach) {
    const t = this.t;
    const T = this.b.terrain;
    let prev = t.y;
    const maxSlope = Math.tan(t.climb * 0.9);
    let d = 0;
    for (; d < reach; d += 2) {
      const x = t.x + dir * (d + 2);
      if (x < 8 || x > WORLD.width - 8) break;
      const g = T.groundBelow(x, prev + 3.5);
      if (g < prev - 3 || (g - prev) / 2 > maxSlope) break;
      prev = g;
    }
    return d;
  }

  // The x to drive to, or NaN to stay.
  planMove(reason) {
    const t = this.t;
    const reach = Math.min(t.fuel - 0.5, t.speed * (reason === 'hazard' ? MAX_ESCAPE : MAX_DRIVE) * 0.95);
    if (reach < 4) return NaN;
    const base = this.positionScore(t.x);
    const margin = reason === 'tactical' ? 2.5 : 1;
    let best = NaN;
    let bs = base + margin;
    for (let dir = -1; dir <= 1; dir += 2) {
      const lim = this.pathLimit(dir, reach);
      for (let d = 3; d <= lim; d += 3) {
        const xc = t.x + dir * d;
        let s = this.positionScore(xc) - d * 0.03;
        if (reason === 'hurt') s += Math.min(d, 20) * 0.15;
        if (s > bs) {
          bs = s;
          best = xc;
        }
      }
    }
    return best;
  }

  // Drives to x, stopping short of a ledge or crater, within the time and fuel.
  *drive(goal, maxTime = MAX_DRIVE) {
    const t = this.t;
    const T = this.b.terrain;
    const dir = Math.sign(goal - t.x) || 1;
    const x0 = t.x;
    let tm = 0;
    let still = 0;
    let lastX = t.x;
    while (Math.abs(goal - t.x) > 0.7 && t.fuel > 0.4 && tm < maxTime && this.clock < 5.4) {
      let safe = true;
      for (let k = 2; k <= 6.5; k += 2.25) {
        if (T.groundBelow(t.x + dir * k, t.y + 4) < t.y - 3.2) safe = false;
      }
      if (!safe) break;
      t.driving = dir;
      yield FRAME;
      tm += this.dt;
      still = Math.abs(t.x - lastX) < 0.004 ? still + this.dt : 0;
      lastX = t.x;
      if (still > 0.5) break; // something is in the way
    }
    t.driving = 0;
    this.moved = Math.abs(t.x - x0) > 1.2;
    // let it settle on its tracks
    let w = 0;
    while ((!t.grounded || Math.abs(t.vx) > 0.5) && w < 0.8) {
      yield FRAME;
      w += this.dt;
    }
  }
}
