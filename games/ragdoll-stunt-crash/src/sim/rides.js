// What the stuntman rides or is fired from. Cars and ramp rides are a
// chassis on sprung wheels (Planck wheel joints) with the stuntman welded to
// the seat; launchers have no body at all, they just place him at the muzzle
// with a velocity. A car is driven at the chosen speed until something stops
// it: a step in which the chassis loses more than CRASH_DV of its speed is a
// crash, the seat lets go and the stuntman keeps the speed he had a step
// before, out through the windscreen (a glass fixture that only he collides
// with, and shatters when he hits it fast). Ramp rides roll down under
// gravity; the player bails with a tap, or a hard knock throws him off.
import { pl, CAT } from './physics.js';
import { RIDES } from './defs.js';
import { POSES } from './ragdoll.js';
import { clamp } from '../config.js';

const CRASH_DV = 4.5; // m/s lost in one step that counts as a crash
const SEAT_BREAK = 70; // N·s through the seat in one step throws him off a ramp ride
const HULL_MASK = CAT.WORLD | CAT.PROP | CAT.TRAFFIC | CAT.DEBRIS;
const RAG_FREE = CAT.WORLD | CAT.PROP | CAT.RIDE | CAT.SCREEN | CAT.TRAFFIC | CAT.DEBRIS | CAT.SENSOR;

const v2 = (p) => pl.Vec2(p[0], p[1]);

export class Ride {
  // (x, ground) is the point on the ground under the chassis centre; slope the ground's angle there
  constructor(phys, rag, id, x, ground, slope = 0, opts = {}) {
    const d = RIDES[id];
    this.phys = phys;
    this.rag = rag;
    this.id = id;
    this.def = d;
    this.kind = d.kind;
    this.top = d.top * (opts.speedMul || 1);
    this.target = 0; // the speed being driven at
    this.state = 'parked'; // parked | driving | crashed (the stuntman has left)
    this.crush = 0; // 0..1 how crumpled the front is
    this.glass = 'intact';
    this.wheels = [];
    this.wheelJoints = [];
    this.seated = false;
    this.cleared = false; // the stuntman is clear of the hull (so he may collide with it)
    this.exitT = -1; // physics time he left
    this.boost = 0; // rocket thrust left (s)
    this.prevV = 0;
    this.tmp = pl.Vec2(0, 0);
    this.ragV = new Float32Array(rag.parts.length * 2); // his velocities a step ago
    this.ground = opts.ground || null; // the terrain, for keeping a ramp ride square to it
    const ca = Math.cos(slope);
    const sa = Math.sin(slope);
    // stand the wheels on the ground: the chassis origin sits wheel.r - wheel.y above it (along the slope's normal)
    const lift = d.wheels.length ? d.wheels[0].r - d.wheels[0].y : -d.skids[0][1] + 0.02;
    const cx = x - sa * lift;
    const cy = ground + ca * lift;
        const owner = { kind: 'ride', mat: 'metal', ride: this, pre: false, touch: -1 };
    this.owner = owner;
    const chassis = phys.body({ type: 'dynamic', position: pl.Vec2(cx, cy), angle: slope, angularDamping: 0.2, bullet: d.top > 30 });
    let area = 0;
    for (const poly of d.hull) area += polyArea(poly);
    const mask = HULL_MASK;
    for (const poly of d.hull) chassis.createFixture(pl.Polygon(poly.map(v2)), { density: (d.mass * 0.82) / area, friction: 0.5, restitution: 0.05, filterCategoryBits: CAT.RIDE, filterMaskBits: mask, userData: owner });
    if (d.skids) {
      const [a, b] = d.skids;
      chassis.createFixture(pl.Box((b[0] - a[0]) / 2, 0.05, pl.Vec2((a[0] + b[0]) / 2, a[1]), 0), { density: 1, friction: 0.03, filterCategoryBits: CAT.RIDE, filterMaskBits: HULL_MASK, userData: owner });
    }
    if (d.glass) {
      // the windscreen: a thin strip just inside the glass line, solid only to the stuntman
      const [g0, g1] = d.glass;
      const dx = g1[0] - g0[0];
      const dy = g1[1] - g0[1];
      const L = Math.hypot(dx, dy);
      const nx = -dy / L;
      const ny = dx / L;
      this.screen = { kind: 'screen', mat: 'glass', ride: this, pre: true, touch: -1, broken: false };
      chassis.createFixture(
        pl.Polygon([pl.Vec2(g0[0] - nx * 0.02, g0[1] - ny * 0.02), pl.Vec2(g1[0] - nx * 0.02, g1[1] - ny * 0.02), pl.Vec2(g1[0] - nx * 0.1, g1[1] - ny * 0.1), pl.Vec2(g0[0] - nx * 0.1, g0[1] - ny * 0.1)]),
        { density: 0.1, friction: 0.2, filterCategoryBits: CAT.SCREEN, filterMaskBits: CAT.RAG, userData: this.screen }
      );
    }
    this.chassis = chassis;
    this.item = phys.track(chassis, 'ride', this);
    for (const w of d.wheels) {
      const wx = cx + w.x * ca - w.y * sa;
      const wy = cy + w.x * sa + w.y * ca;
      const wb = phys.body({ type: 'dynamic', position: pl.Vec2(wx, wy), angularDamping: 0.05, bullet: d.top > 30 });
      const wown = { kind: 'wheel', mat: 'rubber', ride: this, pre: false, touch: -1 };
      wb.createFixture(pl.Circle(w.r), { density: (d.mass * 0.09) / (Math.PI * w.r * w.r), friction: 1.1, restitution: 0.1, filterCategoryBits: CAT.RIDE, filterMaskBits: HULL_MASK, userData: wown });
      const j = phys.world.createJoint(
        pl.WheelJoint({ frequencyHz: d.kind === 'car' ? 3.2 : 6, dampingRatio: d.kind === 'car' ? 0.65 : 0.35, enableMotor: false, maxMotorTorque: d.mass * w.r * 14 }, chassis, wb, wb.getPosition(), pl.Vec2(-sa, ca))
      );
      const wheel = { body: wb, r: w.r, joint: j, owner: wown, item: null, off: false };
      wheel.item = phys.track(wb, 'wheel', wheel);
      this.wheels.push(wheel);
    }
    this.hold(true);
  }

  // Parked rides are static until launched (a ride on a slope would roll away).
  hold(on) {
    const t = on ? 'static' : 'dynamic';
    this.chassis.setType(t);
    for (const w of this.wheels) w.body.setType(t);
    if (!on) {
      this.chassis.setAwake(true);
      for (const w of this.wheels) w.body.setAwake(true);
    }
  }

  // Seat the stuntman.
  seat() {
    const d = this.def;
    const c = this.chassis;
    const p = c.getWorldPoint(v2(d.seat));
    const pose = this.kind === 'car' ? POSES.seat : POSES[this.id] || POSES.cart;
    const rag = this.rag;
    rag.place(p.x, p.y, c.getAngle(), pose);
    rag.control = 'pose';
    rag.attachTo(c, d.seat, d.grip);
    // seated, he passes through the ride's own hull (the seat holds him); once clear he may hit it
    rag.setMask(RAG_FREE & ~CAT.RIDE);
    this.seated = true;
  }

  // Off it goes at `speed` m/s along the ground.
  launch(speed) {
    this.hold(false);
    this.target = clamp(speed, 1, this.top);
    this.state = 'driving';
    const c = this.chassis;
    const a = c.getAngle();
    const v0 = this.kind === 'car' ? this.target * 0.55 : this.target;
    this.setAll(Math.cos(a) * v0, Math.sin(a) * v0);
    if (this.def.nozzle) this.boost = this.kind === 'car' ? 6 : 2.6;
    this.prevV = v0;
  }

  setAll(vx, vy) {
    this.tmp.x = vx;
    this.tmp.y = vy;
    this.chassis.setLinearVelocity(this.tmp);
    for (const w of this.wheels) {
      w.body.setLinearVelocity(this.tmp);
      w.body.setAngularVelocity(-Math.hypot(vx, vy) / w.r);
    }
    this.rag.setVelocity(vx, vy);
  }

  grounded() {
    const s = this.phys.steps;
    for (const w of this.wheels) if (!w.off && w.owner.touch >= s - 2) return true;
    return this.owner.touch >= s - 2 && this.wheels.length === 0;
  }

  // Before each physics step: drive, and remember his velocities.
  before(dt) {
    const rag = this.rag;
    if (this.seated) {
      for (let i = 0; i < rag.parts.length; i++) {
        const v = rag.parts[i].body.getLinearVelocity();
        this.ragV[i * 2] = v.x;
        this.ragV[i * 2 + 1] = v.y;
      }
    }
    if (this.state !== 'driving') return;
    const c = this.chassis;
    const a = c.getAngle();
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    const v = c.getLinearVelocity();
    const along = v.x * fx + v.y * fy;
    // cars and the bike drive toward the target while their wheels grip
    if ((this.kind === 'car' || this.id === 'bike') && this.grounded() && along < this.target) {
      const dv = Math.min(this.target - along, (this.kind === 'car' ? 30 : 14) * dt);
      this.tmp.x = v.x + fx * dv;
      this.tmp.y = v.y + fy * dv;
      c.setLinearVelocity(this.tmp);
      for (const w of this.wheels) if (!w.off) w.body.setAngularVelocity(-(along + dv) / w.r);
    }
    // a ride on the ground is kept square to it (an arcade nudge: short ride wheelbases
    // and a stuntman sitting high would tip over on every bump)
    if (this.kind === 'ramp' && this.grounded() && this.ground) {
      const want = this.ground.slope(c.getPosition().x);
      let err = want - a;
      err -= Math.round(err / (Math.PI * 2)) * Math.PI * 2;
      const I = c.getInertia() + this.rag.pelvis.body.getMass() * 0.6;
      c.applyTorque((err * 140 - c.getAngularVelocity() * 18) * I, true);
    }
    if (this.boost > 0) {
      this.boost -= dt;
      const f = c.getMass() * (this.kind === 'car' ? 9 : 11);
      this.tmp.x = fx * f;
      this.tmp.y = fy * f;
      c.applyForceToCenter(this.tmp, true);
    }
    this.prevV = Math.hypot(v.x, v.y);
  }

  // After each physics step: did it crash, did he get thrown? Returns
  // 'crash' (a car stopped dead), 'thrown' (off a ramp ride) or null.
  after(dt) {
    if (this.state !== 'driving' || !this.seated) {
      this.checkClear();
      return null;
    }
    const v = this.chassis.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y);
    const dv = this.prevV - sp;
    if (dv > CRASH_DV) {
      this.crush = Math.min(1, this.crush + dv / (this.kind === 'car' ? 30 : 60));
      this.eject(true, dv);
      return this.kind === 'car' ? 'crash' : 'thrown';
    }
    if (this.kind === 'ramp') {
      const up = Math.cos(this.chassis.getAngle());
      if (this.rag.attachStress() > SEAT_BREAK || up < -0.2) {
        this.eject(false, 0);
        return 'thrown';
      }
    }
    return null;
  }

  // The seat lets go. With `keep`, he carries on at the speed he had a step ago.
  eject(keep, dv = 0) {
    const rag = this.rag;
    rag.detach();
    this.seated = false;
    this.state = 'crashed';
    this.exitT = this.phys.time;
    rag.control = 'limp';
    if (keep) {
      // he carries on at the speed he had, flung up and out over the bonnet
      // (the car's nose digs in and its tail kicks up as it stops)
      const sp = Math.hypot(this.ragV[0], this.ragV[1]);
      const up = this.kind === 'car' ? 2 + sp * 0.24 : 1 + sp * 0.12;
      for (let i = 0; i < rag.parts.length; i++) {
        this.tmp.x = this.ragV[i * 2] * (this.kind === 'car' ? 0.96 : 1);
        this.tmp.y = this.ragV[i * 2 + 1] + up;
        rag.parts[i].body.setLinearVelocity(this.tmp);
      }
      // and he leaves head first, tipping forward
      rag.chest.body.setAngularVelocity(-1.5);
      rag.byId.head.body.setAngularVelocity(-1.5);
    }
    // a big enough smash throws a wheel off
    if (dv > 14) this.loseWheel(this.wheels[this.wheels.length - 1], dv);
    if (dv > 22) this.loseWheel(this.wheels[0], dv * 0.7);
  }

  loseWheel(w, dv) {
    if (!w || w.off) return;
    w.off = true;
    this.phys.world.destroyJoint(w.joint);
    this.tmp.x = dv * 0.25;
    this.tmp.y = dv * 0.35;
    w.body.setLinearVelocity(this.tmp);
    w.body.setAngularVelocity(-dv * 2);
  }

  // A tap while riding: jump off with a little hop.
  bail() {
    if (!this.seated || this.state !== 'driving') return false;
    this.eject(false, 0);
    const a = this.chassis.getAngle();
    this.rag.addVelocity(-Math.sin(a) * 5 + Math.cos(a) * 1.5, Math.cos(a) * 5 + Math.sin(a) * 1.5);
    return true;
  }

  // Once he is clear of a car's hull he may bounce off it.
  checkClear() {
    if (this.cleared || this.seated) return;
    const rag = this.rag;
    const hull = this.chassis.getFixtureList();
    for (let f = hull; f; f = f.getNext()) {
      if (f.getFilterCategoryBits() !== CAT.RIDE) continue;
      const ab = f.getAABB(0);
      for (const p of rag.parts) {
        const pb = p.body.getFixtureList().getAABB(0);
        if (pb.upperBound.x > ab.lowerBound.x && pb.lowerBound.x < ab.upperBound.x && pb.upperBound.y > ab.lowerBound.y && pb.lowerBound.y < ab.upperBound.y) return;
      }
    }
    this.cleared = true;
    rag.setMask(RAG_FREE);
    for (let f = hull; f; f = f.getNext()) if (f.getFilterCategoryBits() === CAT.RIDE) f.setFilterData({ groupIndex: 0, categoryBits: CAT.RIDE, maskBits: HULL_MASK | CAT.RAG });
  }

  speed() {
    const v = this.chassis.getLinearVelocity();
    return Math.hypot(v.x, v.y);
  }
}

// A cannon or slingshot: where the stuntman leaves it and at what speed.
export class Launcher {
  constructor(id, x, ground, opts = {}) {
    const d = RIDES[id];
    this.id = id;
    this.def = d;
    this.kind = 'cannon';
    this.top = d.top * (opts.powerMul || 1);
    this.x = x; // pivot (cannons) or base centre (slingshot)
    this.y = ground + d.ground;
    this.ground = ground;
    this.angle = 0.6;
    this.power = 0.7;
    this.pull = 0; // slingshot: how far the pouch is drawn back (m)
    this.recoil = 0;
    this.fired = false;
  }

  // the muzzle (or the pouch) in the world
  muzzle(out) {
    const d = this.def;
    if (d.forks) {
      const r = this.pull;
      out.x = this.x - Math.cos(this.angle) * r;
      out.y = this.y + 4.0 - Math.sin(this.angle) * r;
    } else {
      out.x = this.x + Math.cos(this.angle) * d.muzzle;
      out.y = this.y + Math.sin(this.angle) * d.muzzle;
    }
    return out;
  }

  fire(rag) {
    const m = this.muzzle({ x: 0, y: 0 });
    const v = this.power * this.top;
    const vx = Math.cos(this.angle) * v;
    const vy = Math.sin(this.angle) * v;
    // he leaves head first, arms forward, along the barrel
    rag.place(m.x - Math.cos(this.angle) * 0.6, m.y - Math.sin(this.angle) * 0.6, this.angle - Math.PI / 2, POSES.superman, vx, vy);
    rag.control = 'pose';
    rag.target = POSES.superman;
    this.fired = true;
    this.recoil = 1;
    this.pull = 0;
    return v;
  }
}

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}
