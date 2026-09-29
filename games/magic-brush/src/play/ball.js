// The ball: a big soft toy ball (about 12 cm) with coloured panels, on its own
// simple physics (gravity, bounces that squash it, rolling that slows on the
// grass, walls where the lawn ends and props stand). It drops from the sky when
// the button is pressed, and friends take turns to run after it and kick it
// with a hop, often over to another friend. A tap bounces it up again.
//
// Big kids can drag from the ball and let go to throw it: a dotted arc shows
// where it will land while they drag, and a friend fetches it and carries it
// back to the child's side of the garden (a game with no score).
//
// It never gets stuck: a ball that comes to rest against a prop or the edge
// hops back towards the middle by itself, and one that leaves the area drops in
// again from above.
import * as THREE from 'three';
import { walkable, STAGE } from '../world/world.js';
import { rand, clamp, damp, TAU, REDUCED_MOTION } from '../config.js';
import { blobTexture } from './art.js';

const R = 0.068; // radius (m): a ball about 14 cm across
const G = 9; // gravity, a little floaty
const REST = 0.62; // how much of its speed a bounce keeps
const ROLL = 1.8; // rolling on grass slows it by this much per second
const STEP = 1 / 120;
const PANELS = ['#e53935', '#fdd835', '#1e88e5', '#fbfaf6', '#43b649', '#fb8c1a'];
const DUST = [[1.6, 1.4, 1.0], [1.2, 1.4, 1.8]];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// six panels in bright colours with white seams and caps, a little pillowy
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const w = 512 / 6;
  PANELS.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(i * w, 0, w + 1, 256);
    const grad = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.2)');
    grad.addColorStop(0.28, 'rgba(0,0,0,0)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0.1)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = grad;
    g.fillRect(i * w, 0, w + 1, 256);
  });
  g.fillStyle = '#fbfaf6';
  for (let i = 0; i < 6; i++) g.fillRect(i * w - 2, 0, 4, 256);
  g.fillRect(510, 0, 2, 256);
  // white caps at the poles, with a coloured dot
  g.fillRect(0, 0, 512, 22);
  g.fillRect(0, 234, 512, 22);
  g.fillStyle = '#fdd835';
  g.fillRect(0, 0, 512, 8);
  g.fillRect(0, 248, 512, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Ball {
  constructor(T) {
    this.T = T;
    this.pos = new THREE.Vector3(0, 0.5, 0);
    this.vel = new THREE.Vector3();
    this.w = new THREE.Vector3(); // spin (rad/s)
    this.spin = new THREE.Quaternion();
    this.exists = false;
    this.squash = 0;
    this.acc = 0;
    this.restT = 0;
    this.age = 0;
    this.chasers = [];
    this.thinkT = 0;
    this.kickOk = 0;
    this.lastKicker = null;
    this.lastKickT = -9;
    this.leaveUntil = 0;
    this.noChase = 0;
    this.pinT = 0;
    this.pinAt = new THREE.Vector3();
    this.pinCheck = 0;
    this.fetch = null;
    this.carrier = null;
    this.aiming = null;
    this.big = false;

    // the ball: a group (moves and squashes on the world's up) holding the rolling sphere
    this.group = new THREE.Group();
    this.group.visible = false;
    this.tex = ballTexture();
    this.mat = new THREE.MeshPhysicalMaterial({ map: this.tex, roughness: 0.34, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.12 });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), this.mat);
    this.sphere.castShadow = true;
    this.sphere.receiveShadow = false;
    this.group.add(this.sphere);
    // a soft contact shadow on the grass
    this.blobTex = blobTexture();
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.blobTex, color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.blob.visible = false;
    this.blob.renderOrder = -1;
    T.scene.add(this.group, this.blob);

    // the dotted arc and its landing ring, for throwing
    const dg = new THREE.SphereGeometry(0.011, 10, 8);
    this.dots = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.4), transparent: true, opacity: 0.95 }), 16);
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.dots.renderOrder = 7;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.065, 0.09, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.2), transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.visible = false;
    this.ring.renderOrder = 7;
    T.scene.add(this.dots, this.ring);
  }

  warm(on) {
    this.group.visible = on || this.exists;
    this.blob.visible = on || this.exists;
    this.dots.visible = on;
    this.ring.visible = on;
    if (!on) {
      this.dots.visible = false;
      this.ring.visible = false;
    }
  }

  setMode(mode) {
    this.big = mode === 'big';
    if (!this.big) this.release(0, 0, true);
  }

  // ------------------------------------------------------------ dropping in

  // the ball button: a ball drops from the sky onto a free spot of the lawn
  drop() {
    const { T } = this;
    this.cancelAll();
    const s = this.middle();
    this.pos.set(s.x, 1.7, s.z);
    this.vel.set(rand(-0.2, 0.2), 0, rand(-0.2, 0.2));
    this.w.set(rand(-4, 4), rand(-3, 3), rand(-4, 4));
    this.exists = true;
    this.group.visible = true;
    this.blob.visible = true;
    this.restT = 0;
    this.squash = 0;
    this.acc = 0;
    this.leaveUntil = 0;
    T.fx.sparkles.burst(_v.copy(this.pos), T.amount(22), { colors: DUST, speed: 0.6, up: 0.2, size: 0.018, life: 1.1, gravity: -0.5 });
    T.snd.whoop();
    // friends look up at it
    for (const e of T.friends.list) if (!e.leaving && e.state !== 'trick') T.friends.lookAt(e, this.pos, 2);
  }

  // a free spot near the middle of the lawn, away from the friends
  middle() {
    const { T } = this;
    let best = null;
    for (let i = 0; i < 16; i++) {
      const x = STAGE.x + rand(-0.9, 0.9);
      const z = STAGE.z + rand(-0.7, 0.7);
      if (!T.friends.nav.free(x, z, 0.3)) continue;
      let near = 1.2;
      for (const e of T.friends.list) if (!e.leaving && e.home !== 'sky') near = Math.min(near, Math.hypot(e.pos.x - x, e.pos.z - z));
      if (!best || near > best.near) best = { x, z, near };
    }
    return best || { x: STAGE.x, z: STAGE.z };
  }

  cancelAll() {
    const { T } = this;
    for (const c of this.chasers) if (T.mine(c.e, 'ball')) this.free(c.e);
    this.chasers.length = 0;
    if (this.fetch && T.mine(this.fetch.e, 'ball')) this.free(this.fetch.e);
    this.fetch = null;
    this.carrier = null;
    this.aiming = null;
    this.dots.visible = false;
    this.ring.visible = false;
  }

  free(e) {
    this.T.done(e);
    this.T.friends.release(e);
  }

  // where the ball is on the screen; how near (px) is a press to it?
  nearPx(x, y) {
    const { T } = this;
    if (!T.project(this.pos)) return Infinity;
    const rpx = R * T.pxPerM(T.camera.position.distanceTo(this.pos));
    return Math.hypot(x - T.px.x, y - T.px.y) - Math.max(rpx * 1.2, 20);
  }

  // ------------------------------------------------------------ the child's touch

  // a press at (x, y): true if it is on the ball. A tap bounces it; Big kids may drag to throw.
  grab(x, y) {
    if (!this.exists || this.carrier || this.nearPx(x, y) > 14) return false;
    if (this.big) {
      this.aiming = { x0: x, y0: y, moved: 0, valid: false, gx: 0, gz: 0, tf: 1, vx: 0, vy: 0, vz: 0, y0w: 0 };
      this.pos.y = Math.max(this.pos.y, R + 0.1);
      this.vel.set(0, 0, 0);
      this.T.snd.bounce(1);
    } else this.bounceUp();
    return true;
  }

  // the ball is hit up into the air again
  bounceUp() {
    const { T } = this;
    this.vel.set(this.vel.x * 0.4 + rand(-0.35, 0.35), rand(3.1, 3.7), this.vel.z * 0.4 + rand(-0.35, 0.35));
    this.w.set(rand(-6, 6), rand(-4, 4), rand(-6, 6));
    this.squash = 0.25;
    this.restT = 0;
    T.snd.bop();
    T.fx.sparkles.burst(_v.copy(this.pos), T.amount(10), { colors: DUST, speed: 0.4, up: 0.3, size: 0.014, life: 0.8 });
  }

  // the finger moved while aiming: work out the throw and draw its arc
  aim(x, y) {
    const a = this.aiming;
    if (!a) return;
    const { T } = this;
    a.moved = Math.hypot(x - a.x0, y - a.y0);
    if (a.moved < 14) {
      this.dots.visible = false;
      this.ring.visible = false;
      a.valid = false;
      return;
    }
    const gp = T.ground(x, y, _w);
    if (!gp) {
      a.valid = false;
      this.dots.visible = false;
      this.ring.visible = false;
      return;
    }
    // no further than a good throw, and onto ground a friend can stand on
    let dx = gp.x - this.pos.x;
    let dz = gp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const maxD = 3.6;
    if (d > maxD) {
      dx *= maxD / d;
      dz *= maxD / d;
    }
    let gx = this.pos.x + dx;
    let gz = this.pos.z + dz;
    if (!T.friends.nav.free(gx, gz, 0.1)) {
      const near = T.friends.nav.nearestFree(gx, gz, 0.12);
      if (near) {
        gx = near.x;
        gz = near.z;
      }
    }
    a.gx = gx;
    a.gz = gz;
    a.valid = true;
    a.y0w = this.pos.y;
    const D = Math.hypot(gx - this.pos.x, gz - this.pos.z);
    a.tf = clamp(0.5 + D * 0.2, 0.6, 1.25);
    a.vx = (gx - this.pos.x) / a.tf;
    a.vz = (gz - this.pos.z) / a.tf;
    a.vy = (T.groundAt(gx, gz) + R - this.pos.y + 0.5 * G * a.tf * a.tf) / a.tf;
    // the dots along the arc
    const n = this.dots.count;
    for (let i = 0; i < n; i++) {
      const t = (a.tf * (i + 1)) / (n + 0.6);
      const s = 1 - 0.45 * (i / n);
      _m.compose(_p.set(this.pos.x + a.vx * t, this.pos.y + a.vy * t - 0.5 * G * t * t, this.pos.z + a.vz * t), _q.identity(), _s.set(s, s, s));
      this.dots.setMatrixAt(i, _m);
    }
    this.dots.instanceMatrix.needsUpdate = true;
    this.dots.visible = true;
    this.ring.position.set(gx, T.groundAt(gx, gz) + 0.012, gz);
    this.ring.visible = true;
  }

  // the finger lifted: throw (or bounce, for a tap); abort drops the grab
  release(x, y, abort = false) {
    const a = this.aiming;
    if (!a) return;
    this.aiming = null;
    this.dots.visible = false;
    this.ring.visible = false;
    if (abort) return;
    if (!a.valid) {
      this.bounceUp();
      return;
    }
    const { T } = this;
    this.vel.set(a.vx, a.vy, a.vz);
    this.w.set(rand(-8, 8), rand(-3, 3), rand(-8, 8));
    this.squash = -0.1;
    this.restT = 0;
    T.snd.whoosh();
    for (const e of T.friends.list) if (!e.leaving && e.state !== 'trick' && !e.toy) T.friends.lookAt(e, this.pos, 1.6);
    this.startFetch();
  }

  // ------------------------------------------------------------ physics

  step(h) {
    const { T } = this;
    const p = this.pos;
    const v = this.vel;
    v.y -= G * h;
    p.addScaledVector(v, h);
    // the ground
    const gy = T.groundAt(p.x, p.z) + R;
    let grounded = false;
    if (p.y <= gy) {
      p.y = gy;
      if (v.y < -0.5) {
        const impact = -v.y;
        v.y = impact * REST;
        v.x *= 0.82;
        v.z *= 0.82;
        this.squash = Math.max(this.squash, Math.min(0.3, impact * 0.07));
        if (impact > 0.8) T.snd.bounce(impact);
        if (impact > 2) T.fx.sparkles.burst(_v.set(p.x, p.y - R + 0.01, p.z), 3, { colors: DUST, speed: 0.25, up: 0.3, size: 0.012, life: 0.6 });
      } else {
        v.y = 0;
        grounded = true;
      }
    }
    const sp = Math.hypot(v.x, v.z);
    if (grounded) {
      if (sp > 1e-4) {
        const ns = Math.max(0, sp * Math.exp(-ROLL * h) - 0.05 * h);
        const k = ns / sp;
        v.x *= k;
        v.z *= k;
      }
      // it rolls: spin follows the ground speed
      const k = 1 - Math.exp(-18 * h);
      this.w.x += (v.z / R - this.w.x) * k;
      this.w.z += (-v.x / R - this.w.z) * k;
      this.w.y *= Math.exp(-3 * h);
    } else {
      const d = Math.exp(-0.05 * h);
      v.x *= d;
      v.z *= d;
    }
    this.walls();
    this.friendsHit();
    this.restT = grounded && Math.hypot(v.x, v.z) < 0.07 ? this.restT + h : 0;
  }

  // keep to the lawn and deck, and off the pond, the trunks, the easel and the other props
  walls() {
    const p = this.pos;
    const v = this.vel;
    const w = walkable(p.x, p.z) + R;
    if (w <= 0) return;
    const e = 0.04;
    const gx = walkable(p.x + e, p.z) - walkable(p.x - e, p.z);
    const gz = walkable(p.x, p.z + e) - walkable(p.x, p.z - e);
    const l = Math.hypot(gx, gz);
    if (l < 1e-6) return;
    const nx = -gx / l;
    const nz = -gz / l;
    const push = Math.min(w, 0.1);
    p.x += nx * push;
    p.z += nz * push;
    const vn = v.x * nx + v.z * nz;
    if (vn < 0) {
      v.x -= 1.55 * vn * nx;
      v.z -= 1.55 * vn * nz;
      if (-vn > 0.7) this.T.snd.bounce(-vn * 0.8);
    }
  }

  // a friend is solid to the ball: it is knocked away
  friendsHit() {
    const { T } = this;
    const p = this.pos;
    const v = this.vel;
    for (const e of T.friends.list) {
      if (e.leaving || e.state === 'journey' || e.home === 'sky' || e.home === 'pond' || e === this.carrier) continue;
      if (this.fetch && e === this.fetch.e && this.fetch.phase === 'run') continue;
      const rr = e.friend.restRadius * e.scale;
      if (p.y - R > rr * 1.1) continue;
      const fr = clamp(0.4 * rr, 0.06, 0.3);
      const dx = p.x - e.pos.x;
      const dz = p.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const min = fr + R;
      if (d >= min || d < 1e-5) continue;
      const nx = dx / d;
      const nz = dz / d;
      p.x += nx * (min - d);
      p.z += nz * (min - d);
      const ex = Math.sin(e.heading) * e.speed;
      const ez = Math.cos(e.heading) * e.speed;
      const vn = (v.x - ex) * nx + (v.z - ez) * nz;
      if (vn < 0) {
        v.x -= 1.5 * vn * nx;
        v.z -= 1.5 * vn * nz;
        const s = Math.hypot(v.x, v.z);
        if (s > 3.4) {
          v.x *= 3.4 / s;
          v.z *= 3.4 / s;
        }
        if (-vn > 0.35) T.snd.bop();
      }
    }
  }

  // ------------------------------------------------------------ friends and the ball

  // the friend's footprint on the lawn
  foot(e) {
    return clamp(0.4 * e.friend.restRadius * e.scale, 0.06, 0.3);
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  // who chases the ball, taking turns
  thinkChasers(dt) {
    if ((this.thinkT -= dt) > 0) return;
    this.thinkT = 0.25;
    const { T } = this;
    for (let i = this.chasers.length - 1; i >= 0; i--) if (!T.mine(this.chasers[i].e, 'ball')) this.chasers.splice(i, 1);
    if (this.carrier || this.aiming || this.fetch || T.clock < this.leaveUntil || T.clock < this.noChase || this.chasers.length >= 2) return;
    const walkers = T.freeWalkers();
    let best = null;
    let bd = 5.5;
    for (const e of walkers) {
      // the one that has just kicked lets another have a go
      if (e === this.lastKicker && T.clock - this.lastKickT < 1.5 && walkers.length > 1) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) this.assign(best);
  }

  assign(e) {
    const c = { e, ready: false, tx: 0, tz: 0, next: 0.35, goal: null, gx: 0, gz: 0 };
    this.chasers.push(c);
    this.pickGoal(c);
    this.route(c);
  }

  // where this friend will kick the ball to: over to another friend, or somewhere on the lawn
  pickGoal(c) {
    const { T } = this;
    let n = 0;
    let other = null;
    for (const o of T.friends.list) {
      if (o === c.e || o.leaving || o.home !== 'ground' || o.state === 'journey') continue;
      if (Math.random() < 1 / ++n) other = o;
    }
    if (other && Math.random() < 0.7) {
      c.goal = other;
      return;
    }
    c.goal = null;
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU);
      const r = rand(0.2, 1.1);
      const x = STAGE.x + Math.sin(a) * r;
      const z = STAGE.z + Math.cos(a) * r * 0.8;
      if (T.friends.nav.free(x, z, 0.25)) {
        c.gx = x;
        c.gz = z;
        return;
      }
    }
    c.gx = STAGE.x;
    c.gz = STAGE.z;
  }

  // the direction and strength of this chaser's kick
  kickVec(c) {
    const p = this.pos;
    const tx = c.goal ? c.goal.pos.x : c.gx;
    const tz = c.goal ? c.goal.pos.z : c.gz;
    let dx = tx - p.x;
    let dz = tz - p.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.4) {
      // no room to go that way: kick straight on from where the friend stands
      dx = p.x - c.e.pos.x;
      dz = p.z - c.e.pos.z;
      d = Math.hypot(dx, dz) || 1;
      c.dist = 1.1;
    } else c.dist = clamp(c.goal ? d - 0.3 : d, 0.7, 2.2);
    c.dx = dx / d;
    c.dz = dz / d;
  }

  // run to the spot behind the ball, facing where it will go
  route(c) {
    const { T } = this;
    const e = c.e;
    this.kickVec(c);
    const p = this.pos;
    const gap = this.foot(e) + R + 0.1;
    // behind the ball, or swung round to either side until there is room to stand
    let sx = 0;
    let sz = 0;
    let found = false;
    for (const ang of [0, 0.7, -0.7, 1.4, -1.4]) {
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const dx = c.dx * ca - c.dz * sa;
      const dz = c.dx * sa + c.dz * ca;
      sx = p.x - dx * gap;
      sz = p.z - dz * gap;
      if (T.friends.nav.free(sx, sz, 0.1)) {
        c.dx = dx;
        c.dz = dz;
        found = true;
        break;
      }
    }
    if (!found) {
      // the ball is jammed somewhere a friend cannot get behind it: leave it to hop out by itself
      this.chasers.splice(this.chasers.indexOf(c), 1);
      this.free(e);
      this.noChase = T.clock + 1.5;
      return;
    }
    c.tx = p.x;
    c.tz = p.z;
    c.ready = false;
    c.next = 0.35;
    const d = Math.hypot(sx - e.pos.x, sz - e.pos.z);
    if (d < 0.08) {
      c.ready = true;
      return;
    }
    const ok = T.go(e, 'ball', { x: sx, z: sz }, { pace: d > 1.1 ? 'run' : 'walk', stopR: 0.04, onArrive: () => (c.ready = true) });
    if (!ok) this.chasers.splice(this.chasers.indexOf(c), 1);
  }

  chase(dt) {
    const { T } = this;
    for (let i = this.chasers.length - 1; i >= 0; i--) {
      const c = this.chasers[i];
      const e = c.e;
      if (c.kicked || !T.mine(e, 'ball')) continue;
      const p = this.pos;
      const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
      if (c.ready) {
        // waiting for the ball to roll to a stop: stay put and watch it
        e.busy = Math.max(e.busy, 0.3);
        e.timer = Math.max(e.timer, 1);
        T.face(e, p.x, p.z, dt, 7);
        const reach = this.foot(e) + R + 0.3;
        if (d > reach + 0.2) this.route(c);
        else if (this.speed < 1.3 && p.y < 0.3 && T.clock > this.kickOk && !this.aiming) this.kick(c);
      } else if ((c.next -= dt) <= 0) {
        c.next = 0.35;
        // it has rolled somewhere else: run after it
        if (Math.hypot(p.x - c.tx, p.z - c.tz) > 0.3) this.route(c);
      }
    }
  }

  // a hop and a kick
  kick(c) {
    const { T } = this;
    const e = c.e;
    const tok = e.toyTok;
    c.ready = false;
    c.kicked = true;
    this.kickOk = T.clock + 0.7;
    T.friends.emote(e, 'hop', 0.62);
    T.later(0.17, () => {
      if (!T.mine(e, 'ball') || e.toyTok !== tok || this.carrier || this.aiming) return;
      const p = this.pos;
      if (Math.hypot(p.x - e.pos.x, p.z - e.pos.z) > this.foot(e) + R + 0.45) return;
      this.kickVec(c);
      const sp = clamp(c.dist * 1.18 + 0.15, 0.8, 3.3);
      this.vel.set(c.dx * sp, 1.35, c.dz * sp);
      this.w.set(rand(-5, 5), rand(-3, 3), rand(-5, 5));
      this.squash = 0.2;
      this.restT = 0;
      this.lastKicker = e;
      this.lastKickT = T.clock;
      T.snd.bop();
      T.fx.sparkles.burst(_v.set(p.x, p.y, p.z), T.amount(8), { colors: DUST, speed: 0.35, up: 0.3, size: 0.014, life: 0.7 });
    });
    T.later(0.75, () => {
      if (!T.mine(e, 'ball') || e.toyTok !== tok) return;
      const i = this.chasers.indexOf(c);
      if (i >= 0) this.chasers.splice(i, 1);
      this.free(e);
    });
  }

  // ------------------------------------------------------------ fetching (Big kids)

  // where the child is: the near edge of the lawn, on the side of the camera
  returnSpot(out) {
    const { T } = this;
    const dx = T.camera.position.x - STAGE.x;
    const dz = T.camera.position.z - STAGE.z;
    const l = Math.hypot(dx, dz) || 1;
    let x = STAGE.x + (dx / l) * 1.5;
    let z = STAGE.z + (dz / l) * 1.5;
    const near = T.friends.nav.nearestFree(x, z, 0.3);
    if (near) {
      x = near.x;
      z = near.z;
    }
    out.x = x;
    out.z = z;
    return out;
  }

  startFetch() {
    const { T } = this;
    if (!this.big) return;
    this.endFetch();
    // the friends that were chasing stand aside for the fetcher
    for (const c of this.chasers) if (T.mine(c.e, 'ball')) this.free(c.e);
    this.chasers.length = 0;
    let best = null;
    let bd = 6;
    for (const e of T.freeWalkers()) {
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) return;
    this.fetch = { e: best, phase: 'run', tx: -99, tz: -99, next: 0, age: 0 };
    best.toy = 'ball';
    this.routeFetch();
  }

  routeFetch() {
    const { T } = this;
    const f = this.fetch;
    const p = this.pos;
    f.tx = p.x;
    f.tz = p.z;
    f.next = 0.3;
    const ok = T.go(f.e, 'ball', { x: p.x, z: p.z }, { pace: 'run', stopR: this.foot(f.e) + R * 0.5 });
    if (!ok) this.endFetch();
  }

  endFetch() {
    const f = this.fetch;
    if (!f) return;
    this.fetch = null;
    if (this.carrier === f.e) this.carrier = null;
    if (this.T.mine(f.e, 'ball')) this.free(f.e);
  }

  fetching(dt) {
    const f = this.fetch;
    if (!f) return;
    const { T } = this;
    f.age += dt;
    if (!T.mine(f.e, 'ball') || f.age > 30) {
      this.endFetch();
      return;
    }
    const p = this.pos;
    if (f.phase === 'run') {
      const d = Math.hypot(p.x - f.e.pos.x, p.z - f.e.pos.z);
      if (this.aiming) return;
      if (d < this.foot(f.e) + R + 0.2 && this.speed < 1.8 && p.y < 0.4) {
        // picked up
        f.phase = 'carry';
        this.carrier = f.e;
        this.vel.set(0, 0, 0);
        T.snd.bop();
        T.fx.sparkles.burst(_v.copy(p), T.amount(8), { colors: DUST, speed: 0.3, up: 0.3, size: 0.014, life: 0.7 });
        T.friends.emote(f.e, 'hop', 0.5);
        const spot = this.returnSpot(_w);
        const ok = T.go(f.e, 'ball', { x: spot.x, z: spot.z }, { pace: 'run', stopR: 0.05, onArrive: () => this.deliver() });
        if (!ok) this.deliver();
      } else if ((f.next -= dt) <= 0) {
        f.next = 0.3;
        if (Math.hypot(p.x - f.tx, p.z - f.tz) > 0.25) this.routeFetch();
      }
    } else if (f.phase === 'carry' && !T.mine(f.e, 'ball')) this.endFetch();
  }

  // the friend puts the ball down on the child's side and cheers
  deliver() {
    const f = this.fetch;
    if (!f) return;
    const { T } = this;
    const e = f.e;
    const carried = this.carrier === e;
    this.carrier = null;
    this.fetch = null;
    if (!carried) {
      this.free(e);
      return;
    }
    this.carryPoint(e, this.pos);
    const s = 0.5;
    this.vel.set(Math.sin(e.heading) * s, 1.9, Math.cos(e.heading) * s);
    this.squash = 0.12;
    this.restT = 0;
    this.leaveUntil = T.clock + 9;
    T.friends.emote(e, 'cheer');
    T.hearts(e, 2);
    T.snd.chirp();
    const tok = e.toyTok;
    T.later(1.5, () => {
      if (T.mine(e, 'ball') && e.toyTok === tok) this.free(e);
    });
  }

  // the ball in front of a friend's chest, where it holds it
  carryPoint(e, out) {
    const rr = e.friend.restRadius * e.scale;
    const bob = Math.sin(this.T.clock * 14) * 0.008 * Math.min(1, e.speed * 3);
    const f = rr * 0.5 + R * 0.5;
    return out.set(e.pos.x + Math.sin(e.heading) * f, e.pos.y + rr * 0.42 + R + bob, e.pos.z + Math.cos(e.heading) * f);
  }

  // ------------------------------------------------------------ never stuck

  unstick(dt) {
    const { T } = this;
    const p = this.pos;
    const wv = walkable(p.x, p.z);
    // far out of bounds: drop in again from above
    if (wv > 0.7 || p.y < -1 || p.y > 8 || !Number.isFinite(p.x + p.y + p.z)) {
      const s = this.middle();
      p.set(s.x, 1.5, s.z);
      this.vel.set(0, 0, 0);
      T.fx.sparkles.burst(_v.copy(p), T.amount(12), { colors: DUST, speed: 0.4, up: 0.2, size: 0.016, life: 0.9 });
      return;
    }
    // pushed against a wall by a friend, going nowhere: that counts as stuck too
    if ((this.pinCheck -= dt) <= 0) {
      this.pinCheck = 0.5;
      const moved = Math.hypot(p.x - this.pinAt.x, p.z - this.pinAt.z);
      this.pinT = moved < 0.05 && this.speed > 0.3 ? this.pinT + 0.5 : 0;
      this.pinAt.copy(p);
    }
    // at rest against a prop or the edge (or forgotten for a long while): a hop back towards the middle
    if ((this.restT > 1.1 && wv > -0.34) || this.restT > 16 || this.pinT >= 1) {
      this.pinT = 0;
      let dx = STAGE.x - p.x;
      let dz = STAGE.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      const sp = this.restT > 16 ? 0.4 : 1.5;
      this.vel.set(dx * sp, 2.8, dz * sp);
      this.w.set(rand(-5, 5), 0, rand(-5, 5));
      this.squash = 0.2;
      this.restT = 0;
      T.snd.bounce(3);
      T.fx.sparkles.burst(_v.copy(p), T.amount(8), { colors: DUST, speed: 0.3, up: 0.3, size: 0.013, life: 0.7 });
    }
  }

  // ------------------------------------------------------------ the frame

  update(dt) {
    if (!this.exists) return;
    const { T } = this;
    this.age += dt;
    if (this.carrier) {
      if (!T.friends.list.includes(this.carrier) || this.carrier.leaving) {
        this.carrier = null;
        this.fetch = null;
      } else {
        this.carryPoint(this.carrier, this.pos);
        this.vel.set(0, 0, 0);
        this.w.set(0, 0, 0);
      }
    } else if (this.aiming) {
      // held: it hovers a little above the grass
      this.vel.set(0, 0, 0);
      this.pos.y = damp(this.pos.y, T.groundAt(this.pos.x, this.pos.z) + R + 0.1, 10, dt);
      this.w.set(0, 2.5, 0);
    } else {
      this.acc = Math.min(this.acc + dt, 0.05);
      while (this.acc >= STEP) {
        this.step(STEP);
        this.acc -= STEP;
      }
      this.unstick(dt);
    }
    this.thinkChasers(dt);
    this.chase(dt);
    this.fetching(dt);
    this.show(dt);
  }

  // the picture: roll, squash, a soft shadow
  show(dt) {
    const p = this.pos;
    // spin
    const wl = this.w.length();
    if (wl > 1e-3) {
      _q.setFromAxisAngle(_v.copy(this.w).divideScalar(wl), wl * dt);
      this.sphere.quaternion.premultiply(_q).normalize();
    }
    this.squash = damp(this.squash, 0, 13, dt);
    const sq = REDUCED_MOTION.matches ? this.squash * 0.4 : this.squash;
    this.group.position.set(p.x, p.y - R * sq, p.z);
    this.group.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    const gy = this.T.groundAt(p.x, p.z);
    const h = Math.max(0, p.y - R - gy);
    this.blob.position.set(p.x, gy + 0.004, p.z);
    const bs = 0.2 + h * 0.28;
    this.blob.scale.set(bs, 1, bs);
    this.blob.material.opacity = 0.42 / (1 + h * 2.4);
    if (this.aiming?.valid) {
      const a = 1 + 0.12 * Math.sin(this.T.clock * 9);
      this.ring.scale.set(a, 1, a);
    }
  }

  dispose() {
    this.cancelAll();
    for (const o of [this.group, this.blob, this.dots, this.ring]) o.removeFromParent();
    this.sphere.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
    this.blob.geometry.dispose();
    this.blob.material.dispose();
    this.blobTex.dispose();
    this.dots.geometry.dispose();
    this.dots.material.dispose();
    this.dots.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
