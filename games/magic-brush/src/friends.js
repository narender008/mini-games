// Friends at play in the world.
//
// Every friend has a tiny brain: it idles with personality (looks about,
// giggles, hops, sniffs, notices your finger), wanders the lawn in front of
// the garden camera, and sometimes plays with another friend (a bow, a chase).
// Getting anywhere is a journey along a path found round the easel, the
// worktable, trunks, lantern posts and the pond (world/nav.js): the friend
// speeds up, turns into its direction of travel with a lean, slows into the
// end, and its gait is driven by its true speed so feet stay planted. Friends
// that do not walk get about the way they would: a flower or tree hops, a
// boat leaps from stone to stone into the pond, a sun or rainbow floats up
// into the sky.
//
// A tap on a friend makes it stop, turn to you and do one of its tricks. Only
// so many friends play at once (by device); when one more arrives, the friend
// who has played longest waves goodbye in a puff of sparkles and goes back to
// the shelf.
//
// For the toys and games (play/): every entry `e` has { friend, pos, heading,
// speed, state, home, scale, busy }. Use
//   send(e, {x, z}, { pace: 'walk'|'run', stopR, onArrive(e), onCancel(e) })
//                              run or walk there by a sensible path
//   release(e)                 back to free roaming
//   emote(e, name, dur)        'hop' 'cheer' 'giggle' 'spin' 'eat' 'nuzzle' 'sniff' 'bow'
//   lookAt(e, point|null, s)   eyes and head follow a point for a while
//   walkers()                  the friends that can be sent places
//   nearest(point, filter)     the closest friend (entry) to a point
//   stageSpot(avoid, r)        a free spot on the lawn in front of the camera
// and set `friends.pointer` (a THREE.Vector3 on the ground, or null) each
// frame so friends notice where the child's finger is.
import * as THREE from 'three';
import { clamp, rand, angleDiff, damp, pick, easeBack, REDUCED_MOTION } from './config.js';
import { homeSpot, onPond, WATER_Y, stageAt, STAGE, STONES_X } from './world/world.js';
import { Nav } from './world/nav.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _vel = new THREE.Vector3();
const WATER = new THREE.Color(0.75, 0.9, 1.0);
const SPARK = [[1.8, 1.4, 0.8], [1.4, 1.2, 1.9]];

// idle fidgets: name, weight (for friends that walk on legs)
const FIDGETS = [
  ['giggle', 3],
  ['hop', 3],
  ['sniff', 2],
  ['spin', 1],
  ['bow', 1],
];

const moveToward = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export class Friends {
  constructor({ scene, fx, audio, quality, walkable, groundAt }) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.q = quality;
    this.walkable = walkable;
    this.groundAt = groundAt;
    this.nav = new Nav(walkable);
    this.list = [];
    this.time = 0;
    this.pointer = null; // the finger on the ground, or null
    this.onLeave = null;
    this.onJourney = null; // (entry, 'start' | 'end') for the camera
    this.socialTimer = rand(8, 14);
    this.later = [];
  }

  // run fn after `sec` seconds of play (paused with the game, unlike setTimeout)
  after(sec, fn) {
    this.later.push({ t: sec, fn });
  }

  get cap() {
    return this.q.active;
  }

  // ------------------------------------------------------------ adding and leaving

  // a friend that has just come alive (or come back from the shelf).
  // fresh: it says hello first; journey: and then sets off for the garden
  add(friend, record, { x, z, heading = 0, fresh = true, journey = fresh } = {}) {
    const home = friend.info.home || 'ground';
    const e = {
      friend,
      record,
      home,
      pos: new THREE.Vector3(x, this.groundAt(x, z), z),
      heading,
      speed: 0,
      state: 'idle',
      timer: fresh ? 1.4 : rand(0.5, 2),
      task: null,
      target: new THREE.Vector3(),
      trickIndex: 0,
      born: performance.now(),
      lookTimer: 0,
      leaving: 0,
      scale: home === 'ground' ? friend.landScale : 1,
      travel: 0,
      busy: 0,
      bank: 0,
      fidget: rand(3, 8),
      squash: 0,
      hopper: null,
      lookHold: 0,
      journey,
    };
    if (home !== 'ground') {
      if (fresh && journey) {
        // say hello where it landed, then off home
        e.state = 'hello';
        e.timer = 0.9;
      } else this.settle(e, this.homeFor(e), fresh);
    } else if (fresh && journey) {
      // (the come-alive moment already ended with its own hello)
      e.state = 'hello';
      e.timer = 0.7;
    }
    friend.object.rotation.order = 'YXZ';
    friend.object.position.copy(e.pos);
    friend.object.rotation.set(0, e.heading, 0);
    friend.object.scale.setScalar(e.scale);
    if (!friend.object.parent) this.scene.add(friend.object);
    this.list.push(e);
    // over the limit: the friend who has played longest goes to the shelf
    const playing = this.list.filter((x) => !x.leaving);
    if (playing.length > this.cap) {
      const oldest = playing.filter((x) => x !== e).sort((a, b) => a.born - b.born)[0];
      if (oldest) this.leave(oldest);
    }
    return e;
  }

  taken(home) {
    return this.list.filter((o) => o.home === home && !o.leaving).map((o) => o.pos);
  }

  // where a friend with a home of its own settles: flowers and trees in the
  // beds around the lawn nearest the garden camera, suns and rainbows up over
  // the garden, boats on the pond
  homeFor(e) {
    if (e.home !== 'garden') return homeSpot(e.home, this.taken(e.home));
    const spots = [[-1.9, -1.6], [-0.9, -3.3], [0.9, -2.6], [1.6, -1.6], [-2.4, -2.6], [0.3, -3.9], [-1.3, -1.7], [1.8, -3.4], [-0.2, -1.5]];
    const taken = this.taken('garden');
    let best = spots[0];
    let bestS = -Infinity;
    for (const p of spots) {
      // not on the stepping stones
      if (Math.abs(p[0] - STONES_X(p[1])) < 0.5) continue;
      let d = 1.5;
      for (const t of taken) d = Math.min(d, Math.hypot(t.x - p[0], t.z - p[1]));
      const s = d * 2 - Math.hypot(p[0] - STAGE.x, p[1] - STAGE.z) * 0.4 + Math.random() * 0.4;
      if (s > bestS) {
        bestS = s;
        best = p;
      }
    }
    return { x: best[0], y: this.groundAt(best[0], best[1]), z: best[1] };
  }

  // put a friend at its home spot; grow: it pops up small and grows to size
  settle(e, spot, grow = true) {
    e.pos.set(spot.x, spot.y, spot.z);
    e.baseY = spot.y;
    e.scale = e.friend.worldScale;
    e.friend.atHome = true;
    e.state = 'idle';
    e.timer = rand(1, 3);
    e.task = null;
    e.speed = 0;
    // face the studio, where the children are
    e.heading = Math.atan2(0.4 - spot.x, 2 - spot.z) + rand(-0.3, 0.3);
    if (grow) e.grow = 0.001;
  }

  leave(e) {
    e.leaving = 0.001;
    e.state = 'leaving';
    e.task = null;
    e.speed = 0;
  }

  has(record) {
    return this.list.some((e) => e.record === record || (e.record && record && e.record.id === record.id));
  }

  clear() {
    for (const e of this.list) {
      this.scene.remove(e.friend.object);
      e.friend.dispose();
    }
    this.list = [];
  }

  // ------------------------------------------------------------ for toys and games

  // friends that can be sent places (not leaving, not in a journey)
  walkers() {
    return this.list.filter((e) => !e.leaving && (e.home === 'ground' || e.home === 'pond') && e.friend.walkSpeed > 0 && e.state !== 'hello' && e.state !== 'journey');
  }

  nearest(p, filter = null) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.list) {
      if (e.leaving || (filter && !filter(e))) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // a free spot on the lawn in front of the garden camera
  stageSpot(avoid = null, r = 0.7) {
    let best = null;
    for (let i = 0; i < 30; i++) {
      const x = STAGE.x + rand(-1.5, 1.5);
      const z = STAGE.z + rand(-1.15, 1.15);
      if (stageAt(x, z) > -0.1 || !this.nav.free(x, z, 0.16)) continue;
      let near = 1.6;
      for (const o of this.list) if (!o.leaving) near = Math.min(near, Math.hypot(o.pos.x - x, o.pos.z - z));
      if (avoid) near = Math.min(near, Math.hypot(avoid.x - x, avoid.z - z) * 1.3);
      const s = near + Math.random() * 0.25;
      if (!best || s > best.s) best = { x, z, s };
    }
    return best ? { x: best.x, z: best.z } : { x: STAGE.x, z: STAGE.z };
  }

  // Send a friend to a point by a sensible path. Returns false when it cannot
  // (a friend that does not walk, or no way through).
  send(e, to, { pace = 'walk', stopR = 0.04, onArrive = null, onCancel = null } = {}) {
    const f = e.friend;
    if (e.leaving || f.walkSpeed <= 0) return false;
    this.cancelTask(e);
    const clear = 0.07 + 0.17 * f.restRadius * e.scale;
    let path = this.nav.find(e.pos.x, e.pos.z, to.x, to.z, clear);
    if (!path) path = this.nav.find(e.pos.x, e.pos.z, to.x, to.z, 0.05);
    if (!path) return false;
    e.task = { path, i: 0, pace, stopR, onArrive, onCancel, stuck: 0, lastD: Infinity, age: 0 };
    e.state = 'go';
    e.busy = 0;
    return true;
  }

  cancelTask(e) {
    const t = e.task;
    if (!t) return;
    e.task = null;
    t.onCancel?.(e);
  }

  // back to roaming freely
  release(e) {
    this.cancelTask(e);
    if (e.state === 'go' || e.state === 'trick') e.state = 'idle';
    e.timer = rand(1.5, 3);
  }

  emote(e, name, dur) {
    if (e.leaving || e.state === 'journey') return false;
    const ok = e.friend.emote(name, dur);
    if (ok) e.busy = Math.max(e.busy, e.friend.emoteState.dur + 0.15);
    return ok;
  }

  lookAt(e, point, seconds = 2) {
    e.friend.look = point;
    e.lookHold = point ? seconds : 0;
  }

  // ------------------------------------------------------------ tapping

  // screen-space tap: the friend under (x, y) px, if any
  pick(x, y, camera, view) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.list) {
      if (e.leaving || e.state === 'journey') continue;
      const f = e.friend;
      const c = f.worldCenter(_v);
      _w.copy(c).project(camera);
      if (_w.z > 1) continue;
      const sx = (_w.x * 0.5 + 0.5) * view.w;
      const sy = (-_w.y * 0.5 + 0.5) * view.h;
      const dist = camera.position.distanceTo(c);
      const rpx = ((f.restRadius * f.object.scale.x) / (dist * Math.tan((camera.fov * Math.PI) / 360))) * (view.h / 2);
      const d = Math.hypot(x - sx, y - sy);
      if (d < rpx * 1.05 + 28 && d / rpx < bestD) {
        bestD = d / rpx;
        best = e;
      }
    }
    return best;
  }

  // a tap: stop, turn to face the camera, do the next trick
  play(e, camera) {
    const f = e.friend;
    if (f.trick || e.state === 'journey' || e.state === 'hello') return;
    const tricks = f.tricks;
    const name = tricks[e.trickIndex % tricks.length];
    e.trickIndex++;
    this.cancelTask(e);
    e.state = 'trick';
    e.speed = 0;
    // friends at home in the sky or a bed keep their place and just turn a little
    e.faceCamera = true;
    f.startTrick(name, f.trickLength(name));
    this.audio.tap?.();
  }

  // ------------------------------------------------------------ the frame

  update(dt, t, camera) {
    this.time += dt;
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      if ((l.t -= dt) <= 0) {
        this.later.splice(i, 1);
        l.fn();
      }
    }
    this.social(dt);
    const n = this.list.length;
    for (let i = n - 1; i >= 0; i--) {
      const e = this.list[i];
      const f = e.friend;
      let shrink = 1;
      e.busy = Math.max(0, e.busy - dt);
      if (e.lookHold > 0 && (e.lookHold -= dt) <= 0 && f.look !== camera.position) f.look = null;
      if (e.leaving) {
        if (!e.waving && !f.trick) {
          e.waving = true;
          f.startTrick('bye', 1.2);
        }
        if (e.waving) e.leaving += dt;
        const k = clamp((e.leaving - 0.8) / 0.6, 0, 1);
        shrink = Math.max(0.001, 1 - k);
        if (k > 0 && !e.poofed) {
          e.poofed = true;
          this.fx.sparkles.burst(f.worldCenter(_v), 50, { colors: SPARK.concat([[1.8, 1.4, 0.8]]), speed: 0.9, up: 0.5 });
          this.audio.poof?.();
        }
        if (k >= 1) {
          this.scene.remove(f.object);
          f.dispose();
          this.list.splice(i, 1);
          this.onLeave?.(e);
          continue;
        }
      } else if (e.state === 'hello') {
        e.timer -= dt;
        f.look = camera.position;
        if (e.timer <= 0) this.setOff(e);
      } else if (e.state === 'journey') {
        shrink = this.journey(e, dt);
      } else this.think(e, dt, t, camera);
      this.integrate(e, dt, shrink, camera);
      for (const ev of f.events) this.onEvent(e, ev);
      f.events.length = 0;
    }
  }

  // move, keep apart, settle onto the ground, write the transform
  integrate(e, dt, shrink, camera) {
    const f = e.friend;
    if (e.state !== 'journey') {
      const fwdX = Math.sin(e.heading);
      const fwdZ = Math.cos(e.heading);
      e.pos.x += fwdX * e.speed * dt;
      e.pos.z += fwdZ * e.speed * dt;
      // stay apart from other friends on the ground
      if (e.home === 'ground' || e.home === 'pond') {
        for (const o of this.list) {
          if (o === e || o.home !== e.home || o.state === 'journey') continue;
          const dx = e.pos.x - o.pos.x;
          const dz = e.pos.z - o.pos.z;
          const d = Math.hypot(dx, dz);
          const want = (f.restRadius * e.scale + o.friend.restRadius * o.scale) * 0.7;
          if (d < want && d > 1e-4) {
            const push = (want - d) * 2.5 * dt;
            e.pos.x += (dx / d) * push;
            e.pos.z += (dz / d) * push;
          }
        }
      }
      const floor = e.home === 'pond' && e.baseY !== undefined ? WATER_Y : e.home === 'sky' && e.baseY !== undefined ? e.baseY : this.groundAt(e.pos.x, e.pos.z);
      e.pos.y = damp(e.pos.y, floor, 12, dt);
    }
    // planting: a friend that has arrived at its home pops up and grows to size
    let grow = 1;
    if (e.grow) {
      e.grow += dt;
      const k = clamp(e.grow / 0.9, 0, 1);
      const g0 = e.growFrom ?? 0.001;
      grow = Math.max(0.001, g0 + (1 - g0) * easeBack(k, 2.2));
      if (k >= 1) e.grow = 0;
    }
    e.squash = damp(e.squash, 0, 9, dt);
    const sq = e.squash;
    f.object.position.copy(e.pos);
    f.object.rotation.set(0, e.heading, e.bank);
    const s = Math.max(0.001, e.scale * shrink * grow);
    f.object.scale.set(s * (1 + sq * 0.5), s * (1 - sq), s * (1 + sq * 0.5));
    // gaits count in the friend's own units
    f.motion.speed = e.speed / Math.max(0.05, e.scale);
    f.update(dt, camera);
  }

  // ------------------------------------------------------------ thinking

  think(e, dt, t, camera) {
    const f = e.friend;
    const roams = (e.home === 'ground' || e.home === 'pond') && f.walkSpeed > 0;
    let desired = e.heading;
    let turnRate = f.turnRate;
    let bankTarget = 0;
    if (e.state === 'trick') {
      if (e.faceCamera) {
        const toCam = Math.atan2(camera.position.x - e.pos.x, camera.position.z - e.pos.z);
        // planted and floating friends only turn part of the way
        desired = roams ? toCam : e.heading + clamp(angleDiff(e.heading, toCam), -0.6, 0.6);
      }
      f.look = camera.position;
      e.speed = damp(e.speed, 0, 6, dt);
      if (!f.trick) {
        e.state = 'idle';
        e.timer = rand(1.5, 3);
        e.faceCamera = false;
      }
    } else if (e.state === 'idle') {
      e.speed = damp(e.speed, 0, 5, dt);
      e.timer -= dt;
      e.lookTimer -= dt;
      this.gaze(e, camera);
      if (e.busy <= 0 && !f.emoting) {
        e.fidget -= dt;
        if (e.fidget <= 0) {
          e.fidget = rand(4, 10);
          if (roams && e.home === 'ground') this.emote(e, this.fidget(), undefined);
        }
      }
      if (e.timer <= 0 && e.busy <= 0) {
        if (roams) this.wander(e);
        else e.timer = rand(2, 5);
      }
    } else if (e.state === 'go') {
      const r = this.followPath(e, dt);
      desired = r.desired;
      turnRate *= r.turnBoost;
      bankTarget = r.bank;
      f.look = null;
    }
    // slow, weighty friends still turn; a friend cannot turn at all while it does a trick in place
    const diff = angleDiff(e.heading, desired);
    e.heading += clamp(diff, -turnRate * dt, turnRate * dt);
    e.bank = damp(e.bank, bankTarget, 6, dt);
  }

  // where the eyes go while standing about: the finger if it is near, else
  // you, else another friend, else nothing in particular
  gaze(e, camera) {
    const f = e.friend;
    const ptr = this.pointer;
    if (ptr && Math.hypot(ptr.x - e.pos.x, ptr.z - e.pos.z) < 2.4) {
      f.look = ptr;
      e.lookHold = 0.6;
      return;
    }
    if (e.lookHold > 0) return;
    if (e.lookTimer > 0) return;
    e.lookTimer = rand(1.5, 4);
    const r = Math.random();
    if (r < 0.45) f.look = camera.position;
    else if (r < 0.75 && this.list.length > 1) {
      const other = pick(this.list.filter((x) => x !== e && !x.leaving));
      f.look = other ? other.friend.object.position : null;
    } else f.look = null;
  }

  fidget() {
    let total = 0;
    for (const [, w] of FIDGETS) total += w;
    let r = Math.random() * total;
    for (const [name, w] of FIDGETS) {
      r -= w;
      if (r <= 0) return name;
    }
    return 'giggle';
  }

  // a stroll to somewhere nearby on the lawn
  wander(e) {
    const pond = e.home === 'pond';
    if (pond) {
      if (e.spot0x === undefined) {
        e.spot0x = e.pos.x;
        e.spot0z = e.pos.z;
      }
      for (let tries = 0; tries < 12; tries++) {
        const x = e.pos.x + rand(-0.7, 0.7);
        const z = e.pos.z + rand(-0.7, 0.7);
        if (onPond(x, z) < -0.25) return this.startWalk(e, x, z);
      }
      return this.startWalk(e, e.spot0x, e.spot0z);
    }
    // friends like company: most strolls end up beside another friend, which keeps
    // the group together in the picture and gives them someone to play with
    const mates = this.walkers().filter((o) => o !== e && o.home === e.home);
    if (mates.length && Math.random() < 0.6) {
      const m = pick(mates);
      const gap = (m.friend.restRadius * m.scale + e.friend.restRadius * e.scale) * 0.9 + 0.1;
      for (let tries = 0; tries < 10; tries++) {
        const a = rand(0, Math.PI * 2);
        const d = gap + rand(0.05, 0.5);
        const x = m.pos.x + Math.sin(a) * d;
        const z = m.pos.z + Math.cos(a) * d;
        if (stageAt(x, z) < -0.1 && this.nav.free(x, z, 0.16)) return this.startWalk(e, x, z);
      }
    }
    for (let tries = 0; tries < 20; tries++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(0.6, 1.7);
      const x = e.pos.x + Math.sin(a) * d;
      const z = e.pos.z + Math.cos(a) * d;
      if (stageAt(x, z) < -0.1 && this.nav.free(x, z, 0.16)) return this.startWalk(e, x, z);
    }
    const s = this.stageSpot();
    this.startWalk(e, s.x, s.z);
  }

  startWalk(e, x, z) {
    if (e.home === 'pond') {
      // on the water: straight lines, no paths to find
      e.task = { path: [{ x, z }], i: 0, pace: 'walk', stopR: 0.05, stuck: 0, lastD: Infinity, age: 0, open: true };
      e.state = 'go';
      return;
    }
    if (!this.send(e, { x, z }, { pace: 'walk' })) e.timer = rand(1.5, 3);
  }

  // Steering along a path: a lookahead point, a speed that eases in and out
  // and drops for sharp turns, and a lean into the bend.
  followPath(e, dt) {
    const f = e.friend;
    const t = e.task;
    if (!t) {
      e.state = 'idle';
      e.timer = rand(2, 5);
      return { desired: e.heading, turnBoost: 1, bank: 0 };
    }
    t.age += dt;
    const path = t.path;
    // move on when a waypoint is reached (corners are cut a little)
    while (t.i < path.length - 1 && Math.hypot(path[t.i].x - e.pos.x, path[t.i].z - e.pos.z) < 0.14 + e.speed * 0.15) t.i++;
    const wp = path[t.i];
    const last = t.i === path.length - 1;
    const dx = wp.x - e.pos.x;
    const dz = wp.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    // steer to a point a little way along the path so bends are smooth
    let ax = dx;
    let az = dz;
    if (!last && d < 0.5) {
      const nx = path[t.i + 1].x - wp.x;
      const nz = path[t.i + 1].z - wp.z;
      const nl = Math.hypot(nx, nz) || 1;
      const k = 1 - d / 0.5;
      ax += (nx / nl) * 0.5 * k;
      az += (nz / nl) * 0.5 * k;
    }
    const desired = Math.atan2(ax, az);
    const diff = angleDiff(e.heading, desired);
    // what is left to go
    let remaining = d;
    for (let i = t.i; i < path.length - 1; i++) remaining += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
    // speeds are in the friend's own units; a bigger friend covers more ground
    const vmax = (t.pace === 'run' ? f.run : f.walkSpeed) * e.scale;
    const accel = vmax / 0.55;
    const decel = vmax / 0.45;
    // a speed from which it can stop at the end, easing in and out
    const vStop = Math.sqrt(2 * decel * 0.8 * Math.max(0, remaining - t.stopR));
    const align = clamp(1.15 - Math.abs(diff) / 1.1, 0.12, 1);
    const want = Math.min(vmax, vStop) * align;
    e.speed = moveToward(e.speed, want, (want > e.speed ? accel : decel * 1.6) * dt);
    // arrived
    if (last && remaining <= t.stopR + 0.03) {
      e.task = null;
      e.speed *= 0.5;
      e.state = 'idle';
      e.timer = rand(1.5, 4);
      t.onArrive?.(e);
      return { desired: e.heading, turnBoost: 1, bank: 0 };
    }
    // stuck (pushed by others, wedged on scenery): give up gracefully
    if (d > t.lastD - 0.002 * (dt * 60)) t.stuck += dt;
    else t.stuck = Math.max(0, t.stuck - dt);
    t.lastD = d;
    if (t.stuck > 2.5 || t.age > 40) {
      const cb = t.onArrive;
      e.task = null;
      e.state = 'idle';
      e.timer = rand(1, 2);
      cb?.(e);
      return { desired: e.heading, turnBoost: 1, bank: 0 };
    }
    // lean into the turn, more at a run
    const bank = clamp(-diff * 0.22 * (e.speed / Math.max(0.05, f.run * e.scale)), -0.22, 0.22);
    return { desired, turnBoost: t.pace === 'run' ? 1.5 : 1.15, bank };
  }

  // ------------------------------------------------------------ social play

  // now and then two free friends play together: one bows and runs over, the
  // other giggles, and they chase each other round for a moment
  social(dt) {
    this.socialTimer -= dt;
    if (this.socialTimer > 0) return;
    this.socialTimer = rand(14, 26);
    const free = this.walkers().filter((e) => e.home === 'ground' && e.state === 'idle' && e.busy <= 0 && !e.friend.trick && !e.friend.emoting);
    if (free.length < 2) return;
    const a = pick(free);
    const others = free.filter((o) => o !== a).sort((p, q) => Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) - Math.hypot(q.pos.x - a.pos.x, q.pos.z - a.pos.z));
    const b = others[0];
    if (Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) > 3) return;
    this.playTogether(a, b);
  }

  playTogether(a, b) {
    const stop = 0.28 + (a.friend.restRadius * a.scale + b.friend.restRadius * b.scale) * 0.5;
    const ok = this.send(a, b.pos, {
      pace: 'run',
      stopR: stop,
      onArrive: () => {
        if (b.leaving) return;
        this.emote(a, 'bow');
        this.lookAt(b, a.friend.object.position, 2);
        this.after(0.7, () => this.chase(b, a));
      },
    });
    if (ok) {
      b.busy = 4;
      this.lookAt(b, a.friend.object.position, 2);
      a.busy = 6;
    }
  }

  // b runs off round the lawn and a chases; both cheer at the end
  chase(b, a) {
    if (a.leaving || b.leaving || this.list.indexOf(a) < 0 || this.list.indexOf(b) < 0) return;
    const spot = this.stageSpot(b.pos, 1);
    b.busy = 0;
    this.send(b, spot, {
      pace: 'run',
      onArrive: () => this.emote(b, 'cheer'),
    });
    b.busy = 6;
    this.after(0.5, () => {
      if (a.leaving) return;
      this.send(a, spot, { pace: 'run', stopR: 0.3, onArrive: () => this.emote(a, 'giggle') });
      a.busy = 6;
    });
  }

  // ------------------------------------------------------------ journeys

  // After the hello: off to the garden, the way this friend gets about
  setOff(e) {
    const f = e.friend;
    e.friend.look = null;
    this.onJourney?.(e, 'start');
    if (e.home === 'ground' && f.walkSpeed > 0) {
      const spot = this.stageSpot(e.pos, 0.9);
      const ok = this.send(e, spot, {
        pace: 'run',
        onArrive: () => this.arrived(e),
        onCancel: () => this.arrived(e, true),
      });
      if (ok) {
        e.state = 'go';
        e.fidget = rand(4, 8);
        return;
      }
      e.state = 'idle';
      this.onJourney?.(e, 'end');
      return;
    }
    // a hopping, floating or leaping journey
    const spot = this.homeFor(e);
    e.spot = spot;
    e.state = 'journey';
    e.jt = 0;
    e.jStart = e.pos.clone();
    e.jScale0 = e.scale;
    e.travel = 0;
    if (e.home === 'sky') {
      const dx = spot.x - e.pos.x;
      const dz = spot.z - e.pos.z;
      e.jDur = 4.2;
      e.jSpin = Math.atan2(dx, dz);
    } else {
      // hops along a path: flowers hop small, trees thump, boats leap stone to stone
      const clear = 0.16;
      let path = this.nav.find(e.pos.x, e.pos.z, spot.x, spot.z, clear);
      if (e.home === 'pond') path = this.pondHops(e, spot);
      if (!path) path = [{ x: spot.x, z: spot.z }];
      e.jPath = path;
      e.jI = 0;
      e.hopper = null;
    }
  }

  // stones and lawn between the easel and the pond, for a boat to leap along
  pondHops(e, spot) {
    const a = this.nav.find(e.pos.x, e.pos.z, -1.2, -2.6, 0.16) || [];
    return a.concat([{ x: spot.x, z: spot.z }]);
  }

  arrived(e, cancelled = false) {
    if (e.arrivedFired) return;
    e.arrivedFired = true;
    if (!cancelled) {
      e.friend.look = null;
      this.emote(e, 'cheer');
    }
    this.onJourney?.(e, 'end');
  }

  // one frame of a special journey; returns the scale factor
  journey(e, dt) {
    const f = e.friend;
    e.jt += dt;
    if (e.home === 'sky') return this.floatUp(e, dt);
    // hopping
    const path = e.jPath;
    const home = e.home;
    const big = home === 'pond' ? 2.2 : f.worldScale > 2 ? 0.55 : 0.4;
    const dur = home === 'pond' ? 0.95 : f.worldScale > 2 ? 0.62 : 0.48;
    const height = home === 'pond' ? 0.75 : f.worldScale > 2 ? 0.11 : 0.09;
    if (!e.hopper) {
      const p = path[e.jI];
      const dx = p.x - e.pos.x;
      const dz = p.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(big, d);
      const last = e.jI === path.length - 1;
      e.hopper = { t: -0.16, from: e.pos.clone(), to: new THREE.Vector3(e.pos.x + (dx / d) * step, 0, e.pos.z + (dz / d) * step), dur: dur * Math.min(1, 0.45 + (step / big) * 0.55), reach: d <= big + 1e-3, last };
      e.hopper.heading = Math.atan2(dx, dz);
    }
    const h = e.hopper;
    h.t += dt;
    // turn towards the hop, then crouch, spring, fly and squash on landing
    e.heading += clamp(angleDiff(e.heading, h.heading), -f.turnRate * 2.5 * dt, f.turnRate * 2.5 * dt);
    if (h.t < 0) {
      const k = (h.t + 0.16) / 0.16;
      e.squash = 0.08 * Math.sin(Math.min(1, k) * Math.PI * 0.5);
      e.speed = 0;
      return 1;
    }
    const k = clamp(h.t / h.dur, 0, 1);
    e.pos.x = h.from.x + (h.to.x - h.from.x) * k;
    e.pos.z = h.from.z + (h.to.z - h.from.z) * k;
    const gy = this.groundAt(e.pos.x, e.pos.z);
    e.pos.y = gy + 4 * height * k * (1 - k);
    e.speed = 0.0;
    f.motion.air = 0;
    // stretched in flight
    e.squash = -0.06 * Math.sin(k * Math.PI);
    if (k >= 1) {
      e.pos.y = gy;
      e.squash = 0.14;
      this.fx.sparkles.burst(_v.set(e.pos.x, gy + 0.02, e.pos.z), home === 'pond' ? 22 : 8, { colors: [[1.6, 1.4, 1]], speed: 0.5, up: 0.4, size: 0.014 });
      if (home === 'pond' && h.reach && e.jI === path.length - 1) {
        // splash into the pond
        for (let i = 0; i < 26; i++) this.fx.droplets.throw(_v.set(e.pos.x, WATER_Y + 0.02, e.pos.z), _vel.set(rand(-0.9, 0.9), rand(1, 2.4), rand(-0.9, 0.9)), WATER, rand(0.004, 0.009), true);
        this.audio.poof?.();
      }
      this.audio.land?.();
      if (h.reach) e.jI++;
      e.hopper = null;
      if (e.jI >= path.length) return this.plant(e);
    }
    return 1;
  }

  // a sun or rainbow rises up over the garden, growing as it goes
  floatUp(e, dt) {
    const f = e.friend;
    const k = clamp(e.jt / e.jDur, 0, 1);
    const ease = k * k * (3 - 2 * k);
    const s = e.spot;
    e.pos.x = e.jStart.x + (s.x - e.jStart.x) * ease + Math.sin(k * Math.PI * 2) * 0.25 * (1 - k);
    e.pos.z = e.jStart.z + (s.z - e.jStart.z) * ease;
    e.pos.y = e.jStart.y + (s.y - e.jStart.y) * ease + Math.sin(k * Math.PI) * 0.4;
    e.heading += clamp(angleDiff(e.heading, Math.atan2(0.4 - s.x, 2 - s.z)), -1.2 * dt, 1.2 * dt);
    const grow = e.jScale0 + (f.worldScale - e.jScale0) * ease;
    if (Math.random() < 0.8) this.fx.sparkles.emit(e.pos.x + rand(-0.1, 0.1), e.pos.y + rand(-0.05, 0.1), e.pos.z + rand(-0.1, 0.1), rand(-0.1, 0.1), rand(-0.15, 0.05), rand(-0.1, 0.1), [1.9, 1.5, 0.8], rand(0.012, 0.03), rand(0.6, 1.2));
    e.speed = 0;
    if (k >= 1) {
      e.pos.set(s.x, s.y, s.z);
      e.baseY = s.y;
      f.atHome = true;
      e.scale = f.worldScale;
      e.state = 'idle';
      e.timer = rand(2, 4);
      this.fx.sparkles.burst(_v.copy(e.pos), 70, { colors: [[1.9, 1.5, 0.8], [1.2, 1.6, 1.2]], speed: 1.1, up: 0.9, size: 0.03 });
      this.audio.magic?.('shimmer');
      f.onArrive?.();
      this.arrived(e);
      return 1;
    }
    e.scale = grow;
    return 1;
  }

  // a flower or tree hops the last hop and plants itself
  plant(e) {
    const f = e.friend;
    const spot = e.spot;
    e.baseY = spot.y;
    e.pos.set(spot.x, spot.y, spot.z);
    e.friend.atHome = true;
    e.state = 'idle';
    e.timer = rand(2, 4);
    e.speed = 0;
    e.squash = 0.18;
    if (e.home === 'pond') {
      e.scale = f.worldScale;
    } else {
      // it puts down roots: a puff of earth and sparkles, and it grows to size
      // (it was hopping at its size on the lawn, so it grows from there)
      e.growFrom = clamp(e.scale / f.worldScale, 0.2, 1);
      e.scale = f.worldScale;
      e.grow = 0.001;
      this.fx.sparkles.burst(_v.set(spot.x, spot.y + 0.1, spot.z), 60, { colors: [[1.9, 1.5, 0.8], [1.2, 1.6, 1.2]], speed: 1.1, up: 0.9, size: 0.03 });
    }
    this.audio.magic?.('shimmer');
    f.onArrive?.();
    this.arrived(e);
    return 1;
  }

  onEvent(e, ev) {
    const f = e.friend;
    if (ev.type === 'sound') this.audio.creature?.(f.info.id, ev.name);
    else if (ev.type === 'puff') {
      const dir = _w.copy(ev.dir).sub(ev.at).normalize();
      const colors = ev.colors || f.sparkleColors || [[1.8, 1.5, 0.8], [0.9, 1.4, 2.0], [1.6, 0.9, 1.9]];
      this.fx.sparkles.burst(ev.at, ev.count ?? 90, { colors, speed: ev.speed ?? 1.6, size: ev.size ?? 0.022, dir: dir.multiplyScalar(ev.push ?? 1.4), spread: 0.6, up: 0.1, life: 1.6, gravity: -0.1 });
    } else if (ev.type === 'sparkle') {
      this.fx.sparkles.burst(ev.at, ev.count ?? 30, { colors: ev.colors || [[1.8, 1.5, 0.9]], speed: ev.speed ?? 0.6, up: ev.up ?? 0.4, size: ev.size ?? 0.018, life: ev.life ?? 1.2 });
    } else if (ev.type === 'splash') {
      // water drops (a whale's spout, a boat's bow wave)
      const c = ev.color || WATER;
      for (let k = 0; k < (ev.count ?? 20); k++) {
        const vel = _vel.set(rand(-0.4, 0.4), rand(0.8, 1.6) * (ev.up ?? 1), rand(-0.4, 0.4));
        this.fx.droplets.throw(ev.at, vel, c, rand(0.004, 0.009), true);
      }
    } else if (ev.type === 'land') {
      this.fx.sparkles.burst(ev.at.setY(this.groundAt(ev.at.x, ev.at.z) + 0.02), 18, { colors: [[1.6, 1.4, 1]], speed: 0.6, up: 0.4, size: 0.015 });
    }
  }
}
