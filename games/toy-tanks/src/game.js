// The rules: whose turn it is, aiming, driving, firing, what a landing ball
// does (craters, splats, points), and the friendly celebration at the end.
//
// Modes:
//   cpu     - you and a friendly computer tank take turns (easy, medium, hard)
//   duo     - two players on one device take turns
//   targets - target practice: balloons, block towers, bullseyes and bonus stars
//   little  - Little ones: tap anywhere and your tank lobs a ball there
// Every mode keeps points. Nobody ever loses: the end is a party for both.
import * as THREE from 'three';
import { DRIVE_PER_TURN, DRIVE_SPEED, BALLS, SIGNATURE, GROUND, clamp, rand, lerp, WIND_MAX } from './config.js';
import { launchVelocity } from './sim.js';
import { Brain } from './ai.js';

const SHOTS = { cpu: 5, duo: 5, little: 10 };
const ANGLE_MIN = 0.12;
const ANGLE_MAX = 1.4;

export class Game {
  constructor(app) {
    this.app = app;
    this.phase = 'idle';
    this.sides = [];
    this.turn = 0;
    this.timer = 0;
    this.pts = new Float32Array(400);
    // one blast event, reused for every burst (see world/react.js)
    this.craterInfo = { x: 0, z: 0, r: 0, depth: 0 };
    this.blastEvent = { x: 0, y: 0, z: 0, power: 0, great: false, kind: '', ground: '', water: false, scale: 1, radius: 0, vx: 0, vy: 0, time: 0, crater: null, tank: null };
    this.land = { x: 0, y: 0, t: 0, shape: null };
    this._v = { x: 0, y: 0 };
    this._m = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this.impacts = [];
  }

  get side() {
    return this.sides[this.turn];
  }

  get other() {
    return this.sides[1 - this.turn];
  }

  // opts: { mode, stage, level, tanks: [view, view], colors, humans: [bool, bool], balls: [kind, kind] }
  start(opts) {
    const app = this.app;
    this.mode = opts.mode;
    this.level = opts.level ?? 'easy';
    this.stageId = opts.stage;
    this.ground = GROUND[opts.stage];
    this.sides = opts.tanks.map((view, i) => ({
      i,
      view,
      x: opts.xs[i],
      y: 0,
      facing: i === 0 ? 1 : -1,
      pitch: 0,
      roll: 0,
      score: 0,
      shots: 0,
      hits: 0,
      human: opts.humans[i],
      ball: opts.balls[i] ?? SIGNATURE[opts.stage],
      angle: 0.75,
      power: 0.55,
      shownAngle: 0.75,
      fuel: 1,
      driveDir: 0,
      brain: opts.humans[i] ? null : new Brain(this.level),
      settle: 0,
      settleVel: 0,
      slideV: 0,
    }));
    for (const s of this.sides) {
      this.placeSide(s, 0, true);
      // what a ball hits: a box round the hull and turret
      const d = s.view.dims;
      s.half = { x: d.length * 0.46, y: d.height * 0.48, z: d.width * 0.46 };
      s.shape = { kind: 'box', x: s.x, y: s.y + s.half.y, z: 0, hx: s.half.x, hy: s.half.y, hz: s.half.z, rot: 0, ref: s.view, tank: s };
    }
    // target practice: just your tank, and the level's targets down the lane
    this.targetLevel = opts.targetLevel ?? null;
    const solo = this.mode === 'targets';
    this.sides[1].view.object.visible = !solo;
    if (solo) {
      this.sides[1].x = 40;
      this.sides[1].shape.y = -40;
      app.targets.setup(this.targetLevel, this.sides[0].x, 7);
      app.targets.onPoints = (pts, x, y) => this.addPoints(this.sides[0], pts, x, y, 'target');
    } else app.targets.clear();
    app.setTankShapes(solo ? [this.sides[0].shape] : this.sides.map((s) => s.shape));
    this.shotsEach = solo ? this.targetLevel.balls : opts.shots ?? SHOTS[this.mode] ?? 5;
    this.turn = 0;
    this.impacts.length = 0;
    this.phase = 'intro';
    this.timer = 0;
    app.ui.setScores(this.sides, this.mode);
    const far = solo ? this.targetsFar() : this.sides[1].x;
    this.frameLane(this.sides[0].x - 0.3, far + 0.3, 0, 0.45, { pace: 1.4, yaw: 0.16 });
    this.newWind();
  }

  addPoints(s, pts, x, y, label) {
    if (!pts) return;
    s.score += pts;
    this.app.ui.popPoints(x, y, pts, label, s);
    this.app.audio.score(pts);
    this.app.ui.setScores(this.sides, this.mode);
  }

  newWind() {
    const [lo, hi] = this.app.stage.wind ?? [0.05, 0.4];
    let w = this.mode === 'little' ? rand(0, 0.12) : rand(lo, hi) * WIND_MAX / 0.6;
    if (this.mode === 'targets') w *= this.targetLevel.wind;
    this.app.world.wind = (Math.random() < 0.5 ? -1 : 1) * w;
    this.app.ui.setWind(this.app.world.wind);
    this.app.audio.wind(Math.abs(this.app.world.wind) / WIND_MAX);
  }

  // ------------------------------------------------------------ turns

  beginTurn() {
    const s = this.side;
    s.fuel = 1;
    s.driveDir = 0;
    this.newWind();
    this.app.audio.turn(this.turn);
    this.app.ui.setTurn(s, this.mode);
    this.frameAim();
    if (s.human) {
      this.phase = 'aim';
      // the first shot starts from a sensible aim that falls a little short,
      // so the whole arc is on screen and the child only has to nudge it
      if (s.shots === 0 && this.mode !== 'little') {
        const target = this.mode === 'targets' ? s.x + s.facing * 0.7 : s.x + (this.other.x - s.x) * 0.62;
        s.angle = 0.86;
        s.power = this.powerToReach(s, s.angle, target);
        this.app.ui.setAim(s.angle, s.power);
      }
      this.app.arc.show(true);
    } else {
      // the computer sometimes rolls a little first, on the same fuel as you
      const d = s.brain.drive(s);
      if (d) {
        this.phase = 'drive';
        s.driveDir = Math.sign(d) * s.facing;
        s.driveTo = 1 - Math.abs(d);
      } else this.think();
    }
  }

  // the computer works out its shot from where it stands, then turns to it
  think() {
    const s = this.side;
    this.phase = 'think';
    this.timer = 0;
    s.plan = s.brain.plan(this.app.flight, this.app.world, s, this.other, (a) => this.muzzleAt(s, a));
    s.planFrom = s.angle;
    s.planPowerFrom = s.power;
    this.app.arc.show(true);
  }

  // in target practice the lane reaches just past the farthest target
  targetsFar() {
    const a = this.sides[0];
    return Math.max(a.x + 0.8, this.app.targets.reach + 0.12);
  }

  frameAim() {
    const a = this.sides[0];
    const b = this.mode === 'targets' ? { x: this.targetsFar(), y: Math.min(a.y, this.app.targets.low) } : this.sides[1];
    const s = this.side;
    const lo = Math.min(a.x, b.x) - 0.15;
    const hi = Math.max(a.x, b.x) + 0.15;
    // lean the picture a little towards whoever is aiming
    this.frameLane(lo, hi, Math.min(a.y, b.y) - 0.06, Math.max(a.y, b.y) + 0.45, { pace: 1.1, yaw: 0.08 * -s.facing, shiftX: s.facing * -0.03 });
  }

  // Frame part of the lane low and close, like a photo taken lying in the
  // grass: the tanks in the lower third with room above for the arc. A tall
  // phone shows it whole and centred from a little higher; a short one lifts
  // the tanks clear of the buttons along the bottom.
  frameLane(x0, x1, y0, y1, opts = {}) {
    const tall = this.app.director.aspect < 1;
    const short = innerHeight < 520;
    // a natural, comfortable distance: the whole battlefield with room
    // around it, the toys at their real size in the scene
    this.app.director.frame(x0, x1, y0 - (short ? 0.16 : 0), y1, {
      margin: tall ? 1.15 : 2,
      maxDist: tall ? 7 : 5,
      pitch: tall ? 0.1 : this.app.stage?.pitch ?? 0.02,
      ...opts,
      yaw: (opts.yaw ?? 0) * (tall ? 0.4 : 1),
      shiftX: tall ? 0 : opts.shiftX ?? 0,
    });
  }

  // where the muzzle would be at elevation `angle` (world, lane plane)
  muzzleAt(s, angle) {
    const v = s.view;
    const keep = s.shownAngle;
    v.setAim(angle);
    v.object.updateMatrixWorld(true);
    v.muzzleWorld(this._m);
    v.setAim(keep);
    v.object.updateMatrixWorld(true);
    return this._m;
  }

  // ------------------------------------------------------------ input

  setAim(angle, power) {
    const s = this.side;
    if (this.phase !== 'aim' || !s?.human) return;
    s.angle = clamp(angle, ANGLE_MIN, ANGLE_MAX);
    s.power = clamp(power, 0, 1);
    this.app.ui.setAim(s.angle, s.power);
  }

  nudgeAim(dAngle, dPower) {
    const s = this.side;
    if (s) this.setAim(s.angle + dAngle, s.power + dPower);
  }

  setBall(kind) {
    const s = this.side;
    if (!s?.human || !BALLS[kind]) return;
    s.ball = kind;
  }

  drive(dir) {
    const s = this.side;
    if (this.phase !== 'aim' || !s?.human) return;
    s.driveDir = dir;
  }

  fire() {
    const s = this.side;
    if (this.phase !== 'aim' && this.phase !== 'think') return;
    if (this.phase === 'aim' && !s.human) return;
    const app = this.app;
    s.driveDir = 0;
    s.view.drive(0);
    app.audio.drive(0);
    s.shownAngle = s.angle;
    s.view.setAim(s.angle);
    s.view.object.updateMatrixWorld(true);
    const m = s.view.muzzleWorld(this._m);
    launchVelocity(s.angle, s.power, s.facing, this._v);
    // this shot's landing spot, so the camera can look ahead
    app.flight.predict(s.ball, m.x, m.y, this._v.x, this._v.y, this.pts, 6, 200, this.land, app.flight.shapes, s.view);
    this.expected = { x: this.land.x, y: this.land.y, t: this.land.t };
    app.flight.fire(s.ball, m.x, m.y, this._v.x, this._v.y, s.view);
    s.view.fire(s.power);
    app.fx.muzzle(m.x, m.y, m.z, Math.cos(s.angle) * s.facing, Math.sin(s.angle), s.ball);
    app.audio.shot(s.ball, s.power);
    app.onShot(s);
    s.shots++;
    app.ui.setScores(this.sides, this.mode);
    this.phase = 'flight';
    this.timer = 0;
    this.impacts.length = 0;
    app.arc.show(false);
  }

  // the power that lands a shot at elevation `angle` on lane point x (the
  // real flight, wind and all, by bisection)
  powerToReach(s, angle, x) {
    let lo = 0;
    let hi = 1;
    let best = 0.5;
    let bestErr = Infinity;
    for (let i = 0; i < 22; i++) {
      const p = (lo + hi) / 2;
      const m = this.muzzleAt(s, angle);
      launchVelocity(angle, p, s.facing, this._v);
      this.app.flight.predict(s.ball, m.x, m.y, this._v.x, this._v.y, this.pts, 8, 180, this.land, this.app.flight.shapes, s.view);
      const err = this.land.x - x;
      if (Math.abs(err) < bestErr) {
        bestErr = Math.abs(err);
        best = p;
      }
      if (err * s.facing > 0) hi = p;
      else lo = p;
    }
    return best;
  }

  // Little ones: throw a ball to wherever the child tapped (a lane point)
  lobTo(x) {
    const s = this.side;
    if (this.phase !== 'aim' || this.mode !== 'little') return;
    const ahead = (x - s.x) * s.facing;
    x = s.x + s.facing * clamp(ahead, 0.25, 2.3);
    const angle = rand(0.85, 1.0);
    const best = this.powerToReach(s, angle, x);
    s.angle = angle;
    s.power = best;
    // turn the barrel up quickly, then fire
    this.phase = 'think';
    this.timer = 0;
    s.plan = { angle, power: best };
    s.planFrom = s.shownAngle;
    s.planPowerFrom = s.power;
    s.quick = true;
  }

  // ------------------------------------------------------------ flight

  onBounce(b, strength) {
    this.app.fx.bounce(b.kind, b.pos.x, b.pos.y, b.pos.z, strength);
    this.app.audio.bounce(strength, this.app.pan(b.pos.x));
  }

  onSplit(b) {
    this.app.fx.split(b.pos.x, b.pos.y, b.pos.z);
    this.app.audio.split(this.app.pan(b.pos.x));
  }

  onImpact(b, shape) {
    const app = this.app;
    const s = this.side;
    const p = b.pos;
    const speed = b.vel.length();
    const tankHit = shape && shape.tank ? shape.tank : null;
    const other = this.other;
    const solo = this.mode === 'targets';
    // closeness to the other tank decides the points and how big a moment
    const near = solo ? 9 : tankHit === other ? 0 : Math.max(0, Math.abs(p.x - other.x) - other.half.x);
    const direct = !solo && tankHit === other;
    let great = direct || near < 0.05;
    if (shape?.target) {
      const before = s.score;
      app.targets.hit(shape, b);
      great = s.score - before >= 70;
    }
    const small = b.child;
    const spec = BALLS[b.kind];
    const scale = small ? 0.62 : 1;
    let x = p.x;
    let z = p.z;
    const E = this.blastEvent;
    E.crater = null;
    if (!tankHit && !shape) {
      const r = 0.095 * spec.crater * scale * (great ? 1.12 : 1) * (0.85 + Math.min(1, speed / 2.5) * 0.3);
      const c = app.terrain.crater(x, z, r, r * 0.36, this.ground);
      app.fx.clearDecalsNear?.(c.x, c.z, r * 1.6);
      if (b.kind === 'mud' || b.kind === 'jelly' || this.ground === 'mud') app.terrain.wetten(x, z, r * 2.2, 0.85);
      E.crater = this.craterInfo;
      E.crater.x = c.x;
      E.crater.z = c.z;
      E.crater.r = r;
      E.crater.depth = r * 0.36;
    }
    const power = Math.min(1, speed / 3);
    const water = !tankHit && !shape && !!app.stageView?.waterAt?.(x, z);
    app.fx.burst(b.kind, x, p.y, z, { power, great, ground: this.ground, water, vx: b.vel.x, vy: b.vel.y, scale });
    app.audio.burst(b.kind, this.ground, power, app.pan(x), great, scale);
    app.world.shockwave?.(x, z, great ? 1 : 0.6);
    // the whole world feels it (see world/react.js)
    E.x = x;
    E.y = p.y;
    E.z = z;
    E.power = power;
    E.great = great;
    E.kind = b.kind;
    E.ground = this.ground;
    E.water = water;
    E.scale = scale;
    E.radius = 0.32 * scale * (great ? 1.3 : 1) * (0.7 + 0.3 * power);
    E.vx = b.vel.x;
    E.vy = b.vel.y;
    E.time = app.time;
    E.tank = tankHit ? tankHit.view : null;
    app.blast(E);
    // tanks near the splash get splatted and giggle
    for (const t of this.sides) {
      const d = Math.abs(t.x - x);
      const reach = 0.28 * scale;
      if (tankHit === t || d < reach) {
        const k = tankHit === t ? 1 : 1 - d / reach;
        t.view.hit(0.4 + 0.6 * k, Math.sign(t.x - x) || 1);
        // a close one shoves the tank a couple of centimetres along the ground
        if (k > 0.3) t.slideV += (Math.sign(t.x - x) || 1) * (0.05 + 0.13 * k) * scale * (great ? 1.2 : 1);
        t.view.splat(b.pos, 0.02 + 0.03 * k * scale, spec.stain ?? spec.color, b.kind);
        if (k > 0.25) app.audio.hitTank(app.pan(t.x));
      }
    }
    // points (every splash counts for something in Little ones)
    let pts = 0;
    let label = '';
    if (solo) {
      // (targets award their own points)
    } else if (this.mode === 'little') {
      pts = direct ? 50 : 10;
      label = direct ? 'splat' : 'pop';
    } else if (direct) {
      pts = 100;
      label = 'splat';
    } else if (near < 0.35) {
      pts = Math.max(5, Math.round((1 - near / 0.35) * 10) * 5);
      label = 'close';
    }
    if (small) pts = Math.round(pts / 2);
    if (direct) s.hits++;
    this.addPoints(s, pts, x, p.y + 0.06, label);
    if (great && !small) app.slowmo(0.55, 0.28);
    app.director.shake(great ? 1 : 0.4);
    this.impacts.push({ x, y: p.y });
  }

  onLost() {}

  // ------------------------------------------------------------ frame

  placeSide(s, dt, snap = false) {
    const t = this.app.terrain;
    const d = s.view.dims;
    const half = (d.contacts[0] - d.contacts[1]) / 2 + 0.01;
    const w = d.width * 0.36;
    const hf = (t.heightAt(s.x + half, w) + t.heightAt(s.x + half, -w)) / 2;
    const hb = (t.heightAt(s.x - half, w) + t.heightAt(s.x - half, -w)) / 2;
    const hl = (t.heightAt(s.x + half, w) + t.heightAt(s.x - half, w)) / 2;
    const hr = (t.heightAt(s.x + half, -w) + t.heightAt(s.x - half, -w)) / 2;
    const y = Math.max((hf + hb) / 2, t.heightAt(s.x, 0) - 0.004);
    const pitch = Math.atan2(hf - hb, 2 * half);
    const roll = Math.atan2(hl - hr, 2 * w);
    if (snap) {
      s.y = y;
      s.pitch = pitch;
      s.roll = roll;
    } else {
      // settle onto new ground with a soft spring, a small toy-like bump
      const k = 1 - Math.exp(-dt * 14);
      s.settleVel += (y - s.y) * 180 * dt;
      s.settleVel *= Math.exp(-dt * 16);
      s.y += s.settleVel * dt;
      if (Math.abs(y - s.y) > 0.03) s.y = y;
      s.pitch += (pitch - s.pitch) * k;
      s.roll += (roll - s.roll) * k;
    }
    if (s.shape) {
      s.shape.x = s.x;
      s.shape.y = s.y + s.half.y;
    }
    const o = s.view.object;
    o.position.set(s.x, s.y, 0);
    o.rotation.set(0, s.facing > 0 ? 0 : Math.PI, 0, 'YXZ');
    // pitch about the lane's depth axis, roll about the lane
    o.rotation.z = s.facing > 0 ? pitch : -pitch;
    o.rotation.x = s.facing > 0 ? -roll : roll;
  }

  update(dt) {
    const app = this.app;
    this.timer += dt;
    for (const s of this.sides) {
      // the barrel follows the aim smoothly
      const da = s.angle - s.shownAngle;
      s.shownAngle += da * Math.min(1, dt * 12);
      s.view.setAim(s.shownAngle);
      if (s === this.side) app.audio.turret(Math.min(1, Math.abs(da) * 4));
      if (s.slideV) this.slideStep(s, dt);
      this.placeSide(s, dt);
      s.view.update(dt, app.time);
    }
    const s = this.side;
    switch (this.phase) {
      case 'intro':
        if (this.timer > 1.3) this.beginTurn();
        break;
      case 'aim':
        this.driveStep(s, dt);
        this.showArc(s);
        break;
      case 'drive':
        this.driveStep(s, dt);
        if (s.fuel <= s.driveTo || (dt > 0 && !s.driving)) {
          s.driveDir = 0;
          this.driveStep(s, 0);
          this.frameAim();
          this.think();
        }
        break;
      case 'think': {
        // the computer (or the Little ones helper) swings the barrel to its
        // plan, pauses as if checking, then fires
        const dur = s.quick ? 0.35 : 1.4;
        const t = Math.min(1, this.timer / dur);
        const e = t * t * (3 - 2 * t);
        s.angle = lerp(s.planFrom, s.plan.angle, e);
        s.power = lerp(s.planPowerFrom, s.plan.power, e);
        this.showArc(s, s.quick ? 1 : 0.45);
        if (this.timer > dur + (s.quick ? 0.05 : 0.45)) {
          s.quick = false;
          this.fire();
        }
        break;
      }
      case 'flight': {
        // keep the whole battlefield in view and just drift with the ball,
        // making room above if it flies high or lands wide
        const b = app.flight.balls.find((x) => x.live);
        const L = this.expected;
        if (b && L) {
          const a = this.sides[0];
          const o = this.mode === 'targets' ? { x: this.targetsFar(), y: Math.min(a.y, app.targets.low) } : this.sides[1];
          const x0 = Math.min(a.x, o.x, b.pos.x, L.x) - 0.15;
          const x1 = Math.max(a.x, o.x, b.pos.x, L.x) + 0.15;
          const y0 = Math.min(a.y, o.y, L.y) - 0.06;
          const y1 = Math.max(Math.max(a.y, o.y) + 0.45, b.pos.y + 0.1);
          this.frameLane(x0, x1, y0, y1, { pace: 1.3, yaw: 0.04 * -this.side.facing });
        }
        if (!app.flight.active) {
          this.phase = 'impact';
          this.timer = 0;
          // a gentle lean in towards the splash, the whole field still in view
          const last = this.impacts[this.impacts.length - 1] ?? this.expected;
          const a = this.sides[0];
          const o = this.mode === 'targets' ? { x: this.targetsFar(), y: Math.min(a.y, app.targets.low) } : this.sides[1];
          const x0 = Math.min(a.x, o.x, last.x) - 0.15;
          const x1 = Math.max(a.x, o.x, last.x) + 0.15;
          const lean = (last.x - (x0 + x1) / 2) * 0.3;
          const tall = app.director.aspect < 1;
          this.frameLane(x0 + lean, x1 + lean, Math.min(a.y, o.y, last.y) - 0.06, Math.max(a.y, o.y) + 0.45, { pace: 1.2, margin: tall ? 1.05 : 1.75 });
        }
        break;
      }
      case 'impact':
        if (this.timer > (this.mode === 'little' ? 1.2 : this.mode === 'targets' ? 1.6 : 2.0)) this.endTurn();
        break;
      default:
        break;
    }
  }

  showArc(s, fraction) {
    const app = this.app;
    const m = this.muzzleAt(s, s.shownAngle);
    launchVelocity(s.shownAngle, s.power, s.facing, this._v);
    const n = app.flight.predict(s.ball, m.x, m.y, this._v.x, this._v.y, this.pts, 3, 200, this.land, app.flight.shapes, s.view);
    app.arc.set(this.pts, n, fraction ?? this.arcFraction());
  }

  // how much of the path the dotted arc shows
  arcFraction() {
    if (this.mode === 'little') return 1;
    if (this.mode === 'cpu') return this.level === 'easy' ? 1 : this.level === 'medium' ? 0.62 : 0.4;
    return 0.62;
  }

  // shoved by a burst: slide, dragging to a stop within a few centimetres,
  // never off the strip or into the other tank
  slideStep(s, dt) {
    const o = s === this.sides[0] ? this.sides[1] : this.sides[0];
    let nx = clamp(s.x + s.slideV * dt, -2.2, 2.2);
    if (o && o.view.object.visible && Math.abs(nx - o.x) < 0.4) nx = s.x;
    s.x = nx;
    s.slideV *= Math.exp(-dt * 9);
    if (Math.abs(s.slideV) < 0.002) s.slideV = 0;
  }

  driveStep(s, dt) {
    const app = this.app;
    if (!s.driveDir || s.fuel <= 0) {
      if (s.driving) {
        s.driving = false;
        s.view.drive(0);
        app.audio.drive(0);
      }
      return;
    }
    const other = this.other;
    const step = s.driveDir * DRIVE_SPEED * dt;
    let nx = s.x + step;
    // stay on the strip and keep a friendly gap from the other tank
    nx = clamp(nx, -2.2, 2.2);
    if (Math.abs(nx - other.x) < 0.4) nx = s.x;
    const moved = Math.abs(nx - s.x);
    s.fuel = Math.max(0, s.fuel - moved / DRIVE_PER_TURN);
    s.x = nx;
    s.driving = moved > 0;
    s.view.drive(moved > 0 ? s.driveDir * DRIVE_SPEED * s.facing : 0);
    app.audio.drive(moved > 0 ? 1 : 0);
    app.ui.setFuel(s.fuel);
  }

  endTurn() {
    const app = this.app;
    const solo = this.mode === 'targets';
    const done = solo
      ? this.sides[0].shots >= this.shotsEach || app.targets.remaining === 0
      : this.sides.every((s) => s.shots >= this.shotsEach || (!s.human && this.mode === 'little'));
    if (done) {
      this.celebrate();
      return;
    }
    if (this.mode !== 'little' && !solo) this.turn = 1 - this.turn;
    this.beginTurn();
  }

  celebrate() {
    const app = this.app;
    this.phase = 'celebrate';
    this.timer = 0;
    app.arc.show(false);
    const a = this.sides[0];
    const b = this.mode === 'targets' ? { x: this.targetsFar(), y: Math.min(a.y, this.app.targets.low) } : this.sides[1];
    for (const s of this.sides) s.view.celebrate(true);
    this.frameLane(Math.min(a.x, b.x) - 0.25, Math.max(a.x, b.x) + 0.25, Math.min(a.y, b.y) - 0.05, Math.max(a.y, b.y) + 0.4, { pace: 1.6, yaw: 0 });
    app.onCelebrate(this.sides, this.mode);
  }

  stop() {
    this.phase = 'idle';
    for (const s of this.sides) {
      s.view.celebrate(false);
      s.view.drive(0);
      s.view.object.visible = true;
    }
    this.app.targets?.clear();
    this.app.arc.show(false);
  }
}
