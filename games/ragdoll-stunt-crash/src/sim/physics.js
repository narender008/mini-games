// The physics world: a Planck.js (Box2D) world stepped at a fixed 120 Hz, the
// list of things the renderer interpolates and the replay records, and the
// contact plumbing. Every fixture carries an owner record in its user data
// ({ kind, mat, ...}); after each step the impacts the solver reported (the
// strongest normal impulse of every touching contact above a floor) sit in a
// preallocated buffer for the run to turn into damage, sparks and sound.
// Bodies are built once per run (building a world takes a few milliseconds,
// so a retry is still instant); nothing in step() allocates.
import * as pl from 'planck';
import { G, rand } from '../config.js';

export { pl };

// collision categories (a fixture collides with another when each one's
// category is in the other's mask)
export const CAT = { WORLD: 1, PROP: 2, RIDE: 4, RAG: 8, SCREEN: 16, TRAFFIC: 32, DEBRIS: 64, SENSOR: 128 };
export const MASK_ALL = 0xffff;

const MAX_IMPACTS = 384;
const IMPACT_FLOOR = 0.6; // N·s: softer touches are not reported

// The impacts of one step, structure-of-arrays.
class Impacts {
  constructor(n) {
    this.n = 0;
    this.a = new Array(n).fill(null); // owner records
    this.b = new Array(n).fill(null);
    this.imp = new Float32Array(n);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.nx = new Float32Array(n); // contact normal, from a to b
    this.ny = new Float32Array(n);
  }
}

export class Physics {
  constructor() {
    this.world = new pl.World({ gravity: pl.Vec2(0, -G) });
    this.items = []; // see track()
    this.impacts = new Impacts(MAX_IMPACTS);
    this.wm = new pl.WorldManifold();
    this.time = 0;
    this.steps = 0;
    // hooks the run sets: preSolve(contact, ownerA, ownerB, vn, nx, ny) may disable a contact
    this.onPreSolve = null;
    this.onBegin = null; // begin(ownerA, ownerB): sensors (hoops, targets)
    this.world.on('pre-solve', (c) => this.preSolve(c));
    this.world.on('begin-contact', (c) => {
      if (!this.onBegin) return;
      const oa = c.getFixtureA().getUserData();
      const ob = c.getFixtureB().getUserData();
      if (oa && ob && (c.getFixtureA().isSensor() || c.getFixtureB().isSensor())) this.onBegin(oa, ob);
    });
    this.world.on('post-solve', (c) => this.postSolve(c));
  }

  // Something drawn and replayed: its pose now and one step ago, and whether it shows.
  track(body, kind, ref) {
    const p = body.getPosition();
    const a = body.getAngle();
    const it = { body, kind, ref, x: p.x, y: p.y, a, px: p.x, py: p.y, pa: a, vis: true, pvis: true, slot: this.items.length };
    this.items.push(it);
    return it;
  }

  body(def) {
    return this.world.createBody(def);
  }

  // The approach speed of a contact along its normal, from the bodies'
  // velocities at the contact point. Allocation-free: reads into this.wm.
  approach(c) {
    const wm = this.wm;
    c.getWorldManifold(wm);
    const fa = c.getFixtureA().getBody();
    const fb = c.getFixtureB().getBody();
    const px = wm.points[0].x;
    const py = wm.points[0].y;
    const va = fa.getLinearVelocity();
    const vb = fb.getLinearVelocity();
    const wa = fa.getAngularVelocity();
    const wb = fb.getAngularVelocity();
    const ca = fa.getWorldCenter();
    const cb = fb.getWorldCenter();
    // v + w x r for both bodies
    const vax = va.x - wa * (py - ca.y);
    const vay = va.y + wa * (px - ca.x);
    const vbx = vb.x - wb * (py - cb.y);
    const vby = vb.y + wb * (px - cb.x);
    return (vax - vbx) * wm.normal.x + (vay - vby) * wm.normal.y;
  }

  preSolve(c) {
    if (!this.onPreSolve) return;
    const oa = c.getFixtureA().getUserData();
    const ob = c.getFixtureB().getUserData();
    if (!oa || !ob || (!oa.pre && !ob.pre)) return;
    const vn = this.approach(c);
    this.onPreSolve(c, oa, ob, vn, this.wm.normal.x, this.wm.normal.y);
  }

  postSolve(c) {
    let imp = 0;
    const n = c.v_pointCount;
    for (let i = 0; i < n; i++) {
      const v = c.v_points[i].normalImpulse;
      if (v > imp) imp = v;
    }
    const oa = c.getFixtureA().getUserData();
    const ob = c.getFixtureB().getUserData();
    if (oa) oa.touch = this.steps;
    if (ob) ob.touch = this.steps;
    if (imp < IMPACT_FLOOR || !oa || !ob) return;
    const B = this.impacts;
    // the same pair may report more than once a step (TOI sub-steps): keep the stronger
    for (let i = B.n - 1; i >= 0 && i >= B.n - 8; i--) {
      if (B.a[i] === oa && B.b[i] === ob) {
        if (imp > B.imp[i]) B.imp[i] = imp;
        return;
      }
    }
    if (B.n >= MAX_IMPACTS) return;
    const wm = this.wm;
    c.getWorldManifold(wm);
    const k = B.n++;
    B.a[k] = oa;
    B.b[k] = ob;
    B.imp[k] = imp;
    B.x[k] = wm.points[0].x;
    B.y[k] = wm.points[0].y;
    B.nx[k] = wm.normal.x;
    B.ny[k] = wm.normal.y;
  }

  step(dt) {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.px = it.x;
      it.py = it.y;
      it.pa = it.a;
      it.pvis = it.vis;
    }
    this.impacts.n = 0;
    this.steps++;
    this.world.step(dt, 8, 3);
    this.time += dt;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const p = it.body.getPosition();
      it.x = p.x;
      it.y = p.y;
      it.a = it.body.getAngle();
    }
  }

  // After a body is moved by hand (placed for a run, teleported), its last
  // pose is its current one, so it does not smear across the screen.
  settle(it) {
    const p = it.body.getPosition();
    it.x = it.px = p.x;
    it.y = it.py = p.y;
    it.a = it.pa = it.body.getAngle();
  }

  // Pushes every dynamic body within r of (x, y) away, falling off with
  // distance; calls hit(body, impulse) for each one reached (for damage).
  blast(x, y, r, power, hit) {
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic() || !b.isActive()) continue;
      const c = b.getWorldCenter();
      const dx = c.x - x;
      const dy = c.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const f = 1 - d / r;
      // the stuntman's parts get less of it (a full kick sends him into orbit)
      const rag = b.getFixtureList().getFilterCategoryBits() === CAT.RAG;
      const j = power * f * f * b.getMass() * (rag ? 0.42 : 1);
      const inv = 1 / Math.max(0.3, d);
      // a little extra lift so blasts throw things up, not just along the ground
      this.tmp.x = dx * inv * j;
      this.tmp.y = (dy * inv + 0.6) * j;
      b.applyLinearImpulse(this.tmp, c, true);
      b.applyAngularImpulse(rand(-0.5, 0.5) * j * 0.05, true);
      if (hit) hit(b, j / b.getMass(), f);
    }
  }
}
Physics.prototype.tmp = pl.Vec2(0, 0);
