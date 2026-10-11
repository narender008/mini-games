// The stuntman: twelve rigid parts joined by eleven revolute joints with
// limits (defs.js). Joint motors give him a little muscle tone when limp and
// pull him into a tuck (hold) or a spread-eagle (release) in the air; a
// torque on the chest spins him while tucked. A joint pulled harder than its
// strength in one step tears apart (the limb flies off with its stump); a
// fractured bone loosens the joint below it, so broken limbs flop the wrong
// way. Nothing here allocates once built.
import { pl, CAT } from './physics.js';
import { PARTS, BODY_PARTS, JOINTS } from './defs.js';
import { clamp } from '../config.js';

const DENSITY = 120; // kg/m² over the 2D area: about 79 kg in all
// A joint tears when its constraint impulse in one step passes TEAR times its
// `brk`; pulls over SOFT of that wear it down (hp), so a few big knocks tear it too.
export const TEAR = 240;
const SOFT = 0.5;
const RAG_MASK = CAT.WORLD | CAT.PROP | CAT.RIDE | CAT.SCREEN | CAT.TRAFFIC | CAT.DEBRIS | CAT.SENSOR;

// Poses: joint angles by the joint's child part (radians, see JOINTS).
export const POSES = {
  stand: {},
  seat: { chest: 0.15, neck: -0.05, head: 0, uarmB: 1.1, larmB: 0.7, uarmF: 1.0, larmF: 0.8, ulegB: 1.55, llegB: -1.45, ulegF: 1.45, llegF: -1.35 },
  cart: { chest: -0.2, neck: 0.1, head: 0.1, uarmB: 1.4, larmB: 0.3, uarmF: 1.3, larmF: 0.4, ulegB: 1.9, llegB: -1.2, ulegF: 1.8, llegF: -1.0 },
  bike: { chest: -0.45, neck: 0.25, head: 0.2, uarmB: 1.3, larmB: 0.5, uarmF: 1.2, larmF: 0.6, ulegB: 1.3, llegB: -1.7, ulegF: 1.2, llegF: -1.6 },
  sled: { chest: 0.35, neck: -0.2, head: 0, uarmB: 1.2, larmB: 0.4, uarmF: 1.1, larmF: 0.5, ulegB: 1.5, llegB: -0.25, ulegF: 1.45, llegF: -0.2 },
  tuck: { chest: -0.8, neck: -0.3, head: -0.2, uarmB: 1.4, larmB: 2.0, uarmF: 1.2, larmF: 2.1, ulegB: 2.1, llegB: -2.3, ulegF: 2.0, llegF: -2.25 },
  spread: { chest: 0.3, neck: 0.2, head: 0.1, uarmB: -1.9, larmB: 0.2, uarmF: 2.5, larmF: 0.3, ulegB: -0.45, llegB: -0.3, ulegF: 0.7, llegF: -0.1 },
  superman: { chest: 0.25, neck: 0.3, head: 0.2, uarmB: 2.8, larmB: 0.1, uarmF: 2.7, larmF: 0.15, ulegB: -0.25, llegB: -0.15, ulegF: -0.15, llegF: -0.1 },
};
// motor strength per joint child (N·m) when holding a pose in the air
const MUSCLE = { chest: 260, neck: 60, head: 30, uarmB: 70, larmB: 40, uarmF: 70, larmF: 40, ulegB: 200, llegB: 120, ulegF: 200, llegF: 120 };
const TONE = 0.07; // limp: this fraction of the muscle as joint friction

export class Ragdoll {
  constructor(phys) {
    this.phys = phys;
    this.parts = [];
    this.byId = {};
    this.joints = [];
    this.control = 'limp'; // limp | tuck | spread | pose
    this.target = POSES.stand;
    this.spin = 0; // -1..1 asked for by the player
    this.spinTorque = 260;
    this.strength = 1; // scales joint tear strength (upgrades / god)
    this.conscious = true;
    this.attach = []; // joints holding him to a ride
    this.tmp = pl.Vec2(0, 0);
    for (const bp of BODY_PARTS) this.addPart(bp);
    for (const jd of JOINTS) this.addJoint(jd);
  }

  addPart(bp) {
    const s = PARTS[bp.shape];
    const body = this.phys.body({ type: 'dynamic', position: pl.Vec2(0, s.y), bullet: true, angularDamping: 0.4, linearDamping: 0.02 });
    let shape;
    if (s.r) shape = pl.Circle(s.r);
    else {
      // a box with chamfered corners, so limbs roll and slide instead of catching
      const hw = s.w / 2;
      const hh = s.h / 2;
      const c = Math.min(hw, hh) * 0.45;
      shape = pl.Polygon([pl.Vec2(-hw + c, -hh), pl.Vec2(hw - c, -hh), pl.Vec2(hw, -hh + c), pl.Vec2(hw, hh - c), pl.Vec2(hw - c, hh), pl.Vec2(-hw + c, hh), pl.Vec2(-hw, hh - c), pl.Vec2(-hw, -hh + c)]);
    }
    const part = {
      id: bp.id,
      shape: bp.shape,
      side: bp.side,
      label: bp.label,
      mult: s.mult,
      body,
      item: null,
      owner: null,
      joint: null, // the joint to its parent (null for the pelvis)
      kids: [], // joints to its children
      attached: true, // still joined to the pelvis through unbroken joints
      fractured: 0,
      severed: false,
      hurt: 0, // dollars of damage taken
      recent: 0, // its last knock (N·s) and when, so a crush is not billed every step
      recentT: -1,
      billed: 0, // the last knock that was billed, and when
      billedT: -9,
      stuck: false,
      burnt: 0, // 0..1 charring
      len: s.r ? s.r * 2 : s.h,
      wid: s.r ? s.r * 2 : s.w,
    };
    part.owner = { kind: 'part', mat: 'flesh', part, rag: this, pre: true, touch: -1 };
    body.createFixture(shape, { density: DENSITY, friction: 0.62, restitution: 0.08, filterCategoryBits: CAT.RAG, filterMaskBits: RAG_MASK, filterGroupIndex: -1, userData: part.owner });
    part.item = this.phys.track(body, 'part', part);
    this.parts.push(part);
    this.byId[bp.id] = part;
  }

  addJoint(jd) {
    const a = this.byId[jd.a];
    const b = this.byId[jd.b];
    const joint = this.phys.world.createJoint(
      pl.RevoluteJoint({ enableLimit: true, lowerAngle: jd.lo, upperAngle: jd.hi, enableMotor: true, maxMotorTorque: MUSCLE[jd.b] * TONE, motorSpeed: 0 }, a.body, b.body, pl.Vec2(0, jd.y))
    );
    const j = {
      def: jd,
      joint,
      a,
      b,
      la: jd.y - PARTS[a.shape].y, // anchor along each part's long axis (local y)
      lb: jd.y - PARTS[b.shape].y,
      lo: jd.lo,
      hi: jd.hi,
      hp: 1,
      broken: false,
      brokeAt: -1, // physics time it tore (for the replay)
      loose: false,
      stress: 0, // the largest impulse it has borne this run
    };
    b.joint = j;
    a.kids.push(j);
    this.joints.push(j);
  }

  get pelvis() {
    return this.byId.pelvis;
  }

  get chest() {
    return this.byId.chest;
  }

  // Lays him out in a pose with the pelvis at (x, y) turned by `angle`, all
  // parts moving at (vx, vy). Joint angles of the pose fill in for missing ones.
  place(x, y, angle, pose, vx = 0, vy = 0) {
    const P = this.pelvis;
    this.put(P, x, y, angle, vx, vy);
    this.placeKids(P, angle, pose, vx, vy);
    this.target = pose;
  }

  placeKids(parent, pa, pose, vx, vy) {
    const pp = parent.body.getPosition();
    for (const j of parent.kids) {
      const ca = pa + (pose[j.b.id] ?? 0);
      // the joint in the world, from the parent; the child hangs from it
      const ax = pp.x - Math.sin(pa) * j.la;
      const ay = pp.y + Math.cos(pa) * j.la;
      const cx = ax + Math.sin(ca) * j.lb;
      const cy = ay - Math.cos(ca) * j.lb;
      this.put(j.b, cx, cy, ca, vx, vy);
      this.placeKids(j.b, ca, pose, vx, vy);
    }
  }

  put(part, x, y, a, vx, vy) {
    const b = part.body;
    this.tmp.x = x;
    this.tmp.y = y;
    b.setTransform(this.tmp, a);
    this.tmp.x = vx;
    this.tmp.y = vy;
    b.setLinearVelocity(this.tmp);
    b.setAngularVelocity(0);
    b.setAwake(true);
    this.phys.settle(part.item);
  }

  // every part's velocity at once (a launch, a bail, a trampoline kick)
  setVelocity(vx, vy) {
    for (const p of this.parts) {
      this.tmp.x = vx;
      this.tmp.y = vy;
      p.body.setLinearVelocity(this.tmp);
    }
  }

  addVelocity(dx, dy, onlyAttached = true) {
    for (const p of this.parts) {
      if (onlyAttached && !p.attached) continue;
      const v = p.body.getLinearVelocity();
      this.tmp.x = v.x + dx;
      this.tmp.y = v.y + dy;
      p.body.setLinearVelocity(this.tmp);
    }
  }

  // Held to a ride by a few joints (pelvis to the seat, hands to the grip).
  attachTo(body, seat, grip) {
    this.detach();
    const P = this.pelvis;
    this.attach.push(this.phys.world.createJoint(pl.WeldJoint({ frequencyHz: 8, dampingRatio: 0.7 }, body, P.body, P.body.getPosition())));
    if (grip) {
      for (const id of ['larmF', 'larmB']) {
        const L = this.byId[id];
        const hand = L.body.getWorldPoint(pl.Vec2(0, -L.len / 2 + 0.03));
        this.attach.push(this.phys.world.createJoint(pl.RevoluteJoint({}, body, L.body, hand)));
      }
    }
    return this.attach;
  }

  detach() {
    for (const j of this.attach) this.phys.world.destroyJoint(j);
    this.attach.length = 0;
  }

  // The impulse a ride's seat joints carry this step (to throw him off on a hard knock).
  attachStress() {
    let m = 0;
    for (const j of this.attach) {
      const i = j.m_impulse;
      const v = Math.sqrt(i.x * i.x + i.y * i.y);
      if (v > m) m = v;
    }
    return m;
  }

  setMask(mask) {
    for (const p of this.parts) {
      const f = p.body.getFixtureList();
      f.setFilterData({ groupIndex: -1, categoryBits: CAT.RAG, maskBits: mask });
    }
  }

  // Motors toward the held pose, or a little friction when limp.
  muscles(dt) {
    const hold = this.conscious && this.control !== 'limp';
    const pose = this.target;
    for (const j of this.joints) {
      if (j.broken) continue;
      const J = j.joint;
      const m = MUSCLE[j.b.id];
      if (hold && j.b.attached) {
        const want = clamp(pose[j.b.id] ?? 0, j.lo, j.hi);
        const err = want - J.getJointAngle();
        J.setMotorSpeed(clamp(err * 14, -14, 14));
        J.setMaxMotorTorque(m * (j.loose ? 0.3 : 1));
      } else {
        J.setMotorSpeed(0);
        J.setMaxMotorTorque(m * TONE * (this.conscious ? 1 : 0.4));
      }
    }
    if (hold && this.control === 'tuck' && this.spin !== 0) this.chest.body.applyTorque(this.spin * this.spinTorque, true);
  }

  // Tears joints pulled past their strength this step; returns how many tore.
  tear(time, onTear) {
    let n = 0;
    for (const j of this.joints) {
      if (j.broken) continue;
      const i = j.joint.m_impulse;
      const v = Math.sqrt(i.x * i.x + i.y * i.y);
      if (v > j.stress) j.stress = v;
      const lim = TEAR * j.def.brk * this.strength;
      if (v > lim * SOFT) j.hp -= ((v - lim * SOFT) / (lim * (1 - SOFT))) ** 1.5 * 0.6;
      if (v > lim || j.hp <= 0) {
        this.sever(j, time);
        n++;
        if (onTear) onTear(j, v);
      }
    }
    return n;
  }

  sever(j, time) {
    if (j.broken) return;
    j.broken = true;
    j.brokeAt = time;
    this.phys.world.destroyJoint(j.joint);
    this.markDetached(j.b);
    if (j.b.id === 'head' || j.b.id === 'neck') this.conscious = false;
  }

  markDetached(part) {
    part.attached = false;
    for (const k of part.kids) if (!k.broken) this.markDetached(k.b);
  }

  // A heavy hit on a part wears the joint it hangs from (k: 0..1 of a full tear).
  wear(part, k) {
    const j = part.joint;
    if (j && !j.broken) j.hp -= k / Math.max(0.5, j.def.brk * this.strength);
  }

  // A broken bone: the joint below it (or the one it hangs from) goes slack.
  fracture(part) {
    part.fractured++;
    const j = part.kids.length ? part.kids[0] : part.joint;
    if (!j || j.broken || j.loose) return;
    j.loose = true;
    const w = 1.1;
    j.joint.setLimits(j.lo - w, j.hi + w);
  }

  // Neck snap: the neck goes floppy (and he is out cold).
  snapNeck() {
    for (const id of ['neck', 'head']) {
      const j = this.byId[id].joint;
      if (j.broken || j.loose) continue;
      j.loose = true;
      j.joint.setLimits(-1.5, 1.5);
    }
    this.conscious = false;
  }

  // how hard the neck joints are pressing on their limits this step
  neckLoad() {
    let m = 0;
    for (const id of ['neck', 'head']) {
      const j = this.byId[id].joint;
      if (j.broken) continue;
      const v = Math.abs(j.joint.m_impulse.z);
      if (v > m) m = v;
    }
    return m;
  }

  // mean speed of the parts still joined to the pelvis
  speed() {
    let s = 0;
    let n = 0;
    for (const p of this.parts) {
      if (!p.attached) continue;
      const v = p.body.getLinearVelocity();
      s += Math.sqrt(v.x * v.x + v.y * v.y);
      n++;
    }
    return n ? s / n : 0;
  }
}
