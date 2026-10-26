// More life for little ones: small, cheap touches that make the garden answer
// back. Each is a handful of instances or a few particles, nothing full-screen.
//
//  - An audience: when a new friend comes alive, friends already in the garden
//    run up beside the easel to peek, and cheer when it leaps out.
//  - Tap the lawn and flowers bloom there: a little cluster pops up out of the
//    grass, opens its petals and sways (one instanced mesh for petals, one for
//    stems; the oldest fade when there are many).
//  - Tap the pond: rings ripple out from the finger and a koi leaps there.
//  - Paint fireworks: when three or more friends answer the call bell, rockets
//    of paint whoosh up behind them and burst in their colours.
//  - A gift: now and then a friend picks a flower, trots up to the child,
//    holds it out and gives it (it floats up and bursts into petals).
//
// main.js calls update(dt, t) every frame and tap(x, y) for a tap on the
// garden that no friend or toy took (both marked [doodle]); debugApi() is
// window.__mb.life.
import * as THREE from 'three';
import { rand, clamp, pick, angleDiff } from '../config.js';
import { STAGE, POND, WATER_Y, onPond, groundAt, stageAt } from '../world/world.js';
import { COLORS } from '../paint/tools.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const EASEL = new THREE.Vector3(0, 0.9, 0.1);

const BLOOM_MAX = 48;
const PETAL_COLORS = [0xff6fa8, 0xffd04a, 0xb57bff, 0xff8a4c, 0x6fc3ff, 0xffffff, 0xff5a6e];

// ------------------------------------------------------------ flower geometry

// five round petals round a yellow middle (unit size: about 1 across), and a
// stem with two leaves below it (1 tall), as two geometries
function flowerGeometries() {
  const petals = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.SphereGeometry(0.26, 10, 6);
    g.scale(1, 0.32, 0.62);
    g.translate(0.27, 0, 0);
    g.rotateY((i / 5) * Math.PI * 2);
    petals.push(g);
  }
  const head = mergeSimple(petals);
  const centre = new THREE.SphereGeometry(0.15, 12, 8);
  centre.scale(1, 0.55, 1);
  centre.translate(0, 0.04, 0);
  const stem = new THREE.CylinderGeometry(0.035, 0.045, 1, 6, 1);
  stem.translate(0, -0.5, 0);
  const leaf = (s) => {
    const l = new THREE.SphereGeometry(0.16, 8, 5);
    l.scale(1.6, 0.18, 0.7);
    l.translate(0.22 * s, 0, 0);
    l.rotateZ(0.5 * s);
    l.translate(0, -0.62 + (s > 0 ? 0 : 0.14), 0);
    return l;
  };
  // the middle is coloured by vertex colour, the stem green
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const stalk = mergeSimple([paint(stem, 0x4c9a3a), paint(leaf(1), 0x5fb844), paint(leaf(-1), 0x5fb844), paint(centre, 0xffc02e)]);
  return { head, stalk };
}

function mergeSimple(list) {
  const out = new THREE.BufferGeometry();
  const names = Object.keys(list[0].attributes).filter((n) => list.every((g) => g.attributes[n]));
  let vtx = 0;
  for (const g of list) vtx += g.attributes.position.count;
  for (const name of names) {
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(vtx * size);
    let o = 0;
    for (const g of list) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const idx = [];
  let base = 0;
  for (const g of list) {
    const ix = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (const i of ix) idx.push(i + base);
    base += g.attributes.position.count;
  }
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

// ------------------------------------------------------------ the life

export class MoreLife {
  constructor(app) {
    this.app = app;
    this.time = 0;
    this.audience = null; // { list: [{ e, x, z }], t, cheered }
    this.wasAlive = false;
    this.blooms = [];
    this.rockets = [];
    this.callPhase = null;
    this.gift = null;
    this.giftTimer = rand(35, 55);
    this.raycaster = new THREE.Raycaster();
    this.buildBlooms();
  }

  get friends() {
    return this.app.friends;
  }

  // ------------------------------------------------------------ every frame

  update(dt, t) {
    this.time += dt;
    this.audienceStep(dt);
    this.bloomStep(dt, t);
    this.rocketStep(dt);
    this.callStep();
    this.giftStep(dt, t);
  }

  // ------------------------------------------------------------ the audience

  // friends already out come to peek round the easel while a new one comes alive
  audienceStep(dt) {
    const app = this.app;
    const alive = !!app.magicRun;
    if (alive && !this.wasAlive) this.gather();
    this.wasAlive = alive;
    const A = this.audience;
    if (!A) return;
    A.t += dt;
    const star = app.magicRun?.f || A.star;
    if (app.magicRun?.f) A.star = app.magicRun.f;
    const landed = app.alive.active?.landed || (A.star && !app.magicRun && A.t > 1);
    for (const s of A.list) {
      const e = s.e;
      if (e.leaving || !this.friends.list.includes(e)) continue;
      if (!s.arrived) continue;
      e.busy = Math.max(e.busy, 0.5);
      e.timer = Math.max(e.timer, 1);
      // watch the easel, then the friend in its leap
      const look = star?.object?.parent ? star.worldCenter(_w) : _w.set(0, 0.9, 0.2);
      this.friends.face(e, Math.atan2(look.x - e.pos.x, look.z - e.pos.z), 5);
      if (!e.lookHold || e.lookHold < 0.3) this.friends.lookAt(e, star?.object?.parent ? star.object.position : EASEL, 0.6);
    }
    if (landed && !A.cheered) {
      A.cheered = true;
      A.end = A.t + 3.2;
      A.list.forEach((s, i) => {
        if (s.e.leaving) return;
        this.friends.after(0.15 + i * 0.18, () => {
          if (!s.e.leaving && this.friends.list.includes(s.e)) {
            this.friends.emote(s.e, i % 2 ? 'cheer' : 'hop');
            this.app.fx.sparkles.burst(_v.copy(s.e.pos).setY(s.e.pos.y + 0.3), 14, { colors: [[1.9, 1.5, 0.8], [1.6, 1.0, 1.8]], speed: 0.5, up: 0.7, size: 0.016 });
          }
        });
      });
    }
    if ((A.end && A.t > A.end) || A.t > 25) {
      for (const s of A.list) if (!s.e.leaving && s.e.state === 'idle') this.friends.release(s.e);
      this.audience = null;
    }
  }

  gather(force = false) {
    const F = this.friends;
    const walkers = F.walkers().filter((e) => e.home === 'ground' && e.state !== 'trick' && !e.friend.trick);
    if (!walkers.length) return false;
    // beside the easel, either side, where the come-alive camera sees them
    const spots = [
      [-0.68, -0.32],
      [0.72, -0.12],
      [-0.98, -0.95],
      [0.95, -0.85],
    ];
    const list = [];
    walkers
      .sort((a, b) => Math.hypot(a.pos.x, a.pos.z) - Math.hypot(b.pos.x, b.pos.z))
      .slice(0, force ? 4 : 3)
      .forEach((e, i) => {
        const [sx, sz] = spots[i];
        const free = F.nav.nearestFree(sx, sz, 0.16) || { x: sx, z: sz };
        const s = { e, x: free.x, z: free.z, arrived: false };
        const ok = F.send(e, free, { pace: 'run', stopR: 0.06, onArrive: () => (s.arrived = true), onCancel: () => (s.arrived = true) });
        if (ok) {
          e.busy = 8;
          list.push(s);
        }
      });
    if (!list.length) return false;
    this.audience = { list, t: 0, cheered: false, star: null };
    return true;
  }

  // ------------------------------------------------------------ blooming flowers

  buildBlooms() {
    const { head, stalk } = flowerGeometries();
    const scene = this.app.scene;
    const pm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
    const sm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, vertexColors: true });
    this.heads = new THREE.InstancedMesh(head, pm, BLOOM_MAX);
    this.stalks = new THREE.InstancedMesh(stalk, sm, BLOOM_MAX);
    for (const m of [this.heads, this.stalks]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.heads.setColorAt(0, _c.set(0xffffff));
  }

  // a little cluster of flowers springs up round a spot on the lawn
  bloom(x, z, n = 3) {
    const app = this.app;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const d = i === 0 ? 0 : rand(0.06, 0.16);
      const fx = x + Math.cos(a) * d;
      const fz = z + Math.sin(a) * d;
      if (onPond(fx, fz) < 0.2 || groundAt(fx, fz) > 0.01) continue;
      if (this.blooms.length >= BLOOM_MAX) this.blooms.shift();
      this.blooms.push({ x: fx, z: fz, t: -i * 0.12, h: rand(0.1, 0.16), s: rand(0.055, 0.075), color: pick(PETAL_COLORS), yaw: rand(0, Math.PI * 2), ph: rand(0, 6), life: rand(26, 34) });
    }
    app.fx.sparkles.burst(_v.set(x, 0.05, z), 12, { colors: [[1.9, 1.6, 0.9], [1.4, 1.9, 1.2]], speed: 0.35, up: 0.6, size: 0.014, life: 0.9 });
    for (let i = 0; i < 6; i++) app.fx.petals.throw(_v.set(x, 0.06, z), _w.set(rand(-0.4, 0.4), rand(0.6, 1.2), rand(-0.4, 0.4)), _c.set(pick(PETAL_COLORS)), rand(0.008, 0.013));
    this.chime([1568, 2093, 2637], 0.07, 0.03);
  }

  bloomStep(dt, t) {
    const B = this.blooms;
    for (let i = B.length - 1; i >= 0; i--) {
      B[i].t += dt;
      if (B[i].t > B[i].life) B.splice(i, 1);
    }
    let n = 0;
    for (const b of B) {
      if (b.t < 0) continue;
      // springs up with an overshoot, opens, sways; shrinks away at the end
      const k = clamp(b.t / 0.7, 0, 1);
      const grow = k >= 1 ? 1 : 1 - Math.exp(-6 * k) * Math.cos(9 * k);
      const fade = clamp((b.life - b.t) / 1.2, 0, 1);
      const g = Math.max(0.001, grow * fade);
      const open = clamp((b.t - 0.25) / 0.6, 0, 1);
      const sway = Math.sin(t * 1.7 + b.ph) * 0.12 + Math.sin(t * 3.1 + b.ph * 2) * 0.04;
      const y0 = groundAt(b.x, b.z);
      const h = b.h * g;
      // the stem, leaning with the sway
      _e.set(0, b.yaw, sway);
      _q.setFromEuler(_e);
      _v.set(b.x, y0 + h, b.z);
      _m.compose(_v, _q, _s.set(b.s * g * 0.9, h, b.s * g * 0.9));
      this.stalks.setMatrixAt(n, _m);
      // the head at the top of the stem, facing up and a little out
      _w.set(-Math.sin(sway) * h, Math.cos(sway) * h, 0).applyQuaternion(_q.setFromEuler(_e.set(0, b.yaw, 0)));
      _e.set(-0.35 * open, b.yaw, sway * 1.4);
      _q.setFromEuler(_e);
      const hs = b.s * g * (0.35 + 0.65 * open);
      _m.compose(_v.set(b.x + _w.x * 0, y0 + h, b.z), _q, _s.set(hs * 1.4, hs * (0.7 + 0.6 * open), hs * 1.4));
      this.heads.setMatrixAt(n, _m);
      this.heads.setColorAt(n, _c.set(b.color));
      n++;
    }
    this.heads.count = this.stalks.count = n;
    if (n) {
      this.heads.instanceMatrix.needsUpdate = true;
      this.stalks.instanceMatrix.needsUpdate = true;
      if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ taps

  // a tap on the garden (screen px) that nothing else took; true if it is used
  tap(x, y) {
    const app = this.app;
    if (app.state !== 'play') return false;
    const ndc = new THREE.Vector2((x / app.view.w) * 2 - 1, -(y / app.view.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, app.camera);
    const ray = this.raycaster.ray;
    if (ray.direction.y >= -0.01) return false;
    // the pond
    const tw = (WATER_Y - ray.origin.y) / ray.direction.y;
    const wp = ray.at(tw, _v);
    if (Math.hypot(wp.x - POND.x, wp.z - POND.z) < POND.r - 0.08) {
      this.pondTap(wp.x, wp.z);
      return true;
    }
    // the lawn (not the deck)
    const tg = -ray.origin.y / ray.direction.y;
    const gp = ray.at(tg, _w);
    if (groundAt(gp.x, gp.z) < 0.01 && Math.hypot(gp.x - STAGE.x, gp.z - STAGE.z) < 5) {
      this.bloom(gp.x, gp.z);
      // (and the friends still look over and trot up, as for any tap on the lawn)
      return false;
    }
    return false;
  }

  // ripples from the finger, and a koi leaps up there
  pondTap(x, z) {
    const pond = this.app.life?.pond;
    if (!pond) return;
    pond.ripple(x, z, 0.9);
    pond.ripple(x, z, 0.5);
    pond.splash?.(x, z, 6, 0.6);
    pond.sound?.()?.plip?.(x, WATER_Y, z, 1.2);
    const L = pond.leap;
    const fish = pond.fish?.[0];
    if (L && fish && !L.on) {
      // the first koi swims its circle: put it under the finger and let it leap
      const a = Math.atan2(z - POND.z, x - POND.x);
      fish.a = a;
      fish.r = clamp(Math.hypot(x - POND.x, z - POND.z), 0.25, POND.r - 0.3);
      pond.leapT = 0;
    }
    for (const e of this.friends.list) if (!e.leaving && e.state !== 'trick') this.friends.lookAt(e, new THREE.Vector3(x, WATER_Y, z), 2);
  }

  // ------------------------------------------------------------ paint fireworks

  callStep() {
    const run = this.app.toys?.call?.run;
    const phase = run?.phase ?? null;
    if (phase === 'cheer' && this.callPhase !== 'cheer') {
      const n = run.list.filter((c) => !c.lost && !c.e.leaving).length;
      if (n >= 3) {
        let x = 0, z = 0;
        for (const c of run.list) {
          x += c.e.pos.x;
          z += c.e.pos.z;
        }
        this.fireworks(x / run.list.length, z / run.list.length, run.fx ?? 0, run.fz ?? 1, run.list.map((c) => c.e));
      }
    }
    this.callPhase = phase;
  }

  // rockets of paint behind (cx, cz), away from the camera direction (fx, fz)
  fireworks(cx, cz, fx = 0, fz = 1, who = []) {
    const colors = [];
    for (const e of who) for (const p of e.friend?.info?.palette || []) colors.push(new THREE.Color(p));
    for (const k of ['pink', 'yellow', 'sky', 'purple', 'orange', 'lime']) colors.push(new THREE.Color(COLORS[k]));
    const n = 5;
    for (let i = 0; i < n; i++) {
      const across = (i - (n - 1) / 2) * 0.55;
      const x = cx - fx * 0.9 + fz * across;
      const z = cz - fz * 0.9 - fx * across;
      this.rockets.push({ x, z, y: 0.05, vy: rand(2.5, 2.9), vx: rand(-0.2, 0.2), vz: rand(-0.2, 0.2), t: -i * 0.22 - rand(0, 0.1), fuse: rand(0.5, 0.6), color: pick(colors), color2: pick(colors) });
    }
  }

  rocketStep(dt) {
    const R = this.rockets;
    const fx = this.app.fx;
    for (let i = R.length - 1; i >= 0; i--) {
      const r = R[i];
      r.t += dt;
      if (r.t < 0) continue;
      if (!r.launched) {
        r.launched = true;
        this.whoosh();
      }
      r.vy -= 2.2 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      // a trail of paint sparks
      for (let k = 0; k < 3; k++) fx.sparkles.emit(r.x + rand(-0.01, 0.01), r.y, r.z + rand(-0.01, 0.01), rand(-0.05, 0.05), rand(-0.3, 0), rand(-0.05, 0.05), [r.color.r * 2 + 0.4, r.color.g * 2 + 0.4, r.color.b * 2 + 0.4], rand(0.012, 0.02), rand(0.3, 0.6));
      if (r.t > r.fuse) {
        const c1 = [r.color.r * 2.4 + 0.3, r.color.g * 2.4 + 0.3, r.color.b * 2.4 + 0.3];
        const c2 = [r.color2.r * 2.4 + 0.3, r.color2.g * 2.4 + 0.3, r.color2.b * 2.4 + 0.3];
        fx.sparkles.burst(_v.set(r.x, r.y, r.z), this.app.toys?.amount?.(110) ?? 110, { colors: [c1, c2, [2.2, 1.9, 1.2]], speed: 1.7, up: 0.2, size: 0.045, life: 1.6, gravity: -0.5 });
        for (let k = 0; k < 10; k++) fx.droplets.throw(_v.set(r.x, r.y, r.z), _w.set(rand(-1.2, 1.2), rand(-0.4, 1.0), rand(-1.2, 1.2)), k % 2 ? r.color : r.color2, rand(0.006, 0.012));
        this.pop();
        R.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ a gift

  giftStep(dt, t) {
    const app = this.app;
    const G = this.gift;
    if (!G) {
      if (app.state !== 'play' || app.toys?.call?.active || this.audience) return;
      this.giftTimer -= dt;
      if (this.giftTimer <= 0) {
        this.giftTimer = rand(50, 80);
        this.startGift();
      }
      return;
    }
    G.t += dt;
    const e = G.e;
    const gone = e.leaving || !this.friends.list.includes(e) || app.state !== 'play';
    if (gone) return this.endGift(false);
    // the flower held out in front of it, bobbing
    const f = e.friend;
    const bob = Math.sin(t * 6) * 0.004;
    G.mesh.position.set(G.x, G.y + bob, G.z);
    G.mesh.rotation.set(0.9 + Math.sin(t * 2.3) * 0.08, 0, Math.sin(t * 3) * 0.12);
    if (G.phase === 'go') {
      if (G.t > 14) return this.endGift(true);
      return;
    }
    if (G.phase === 'offer') {
      G.ot += dt;
      e.busy = Math.max(e.busy, 0.5);
      e.timer = Math.max(e.timer, 1);
      const cam = app.camera.position;
      this.friends.face(e, Math.atan2(cam.x - e.pos.x, cam.z - e.pos.z), 5);
      this.friends.lookAt(e, cam, 0.5);
      // held out, then given (a tap on the friend gives it at once)
      if (G.ot > 2.6 || (e.state === 'trick' && G.ot > 0.3)) this.endGift(true);
    }
  }

  startGift() {
    const app = this.app;
    const F = this.friends;
    const cands = F.walkers().filter((e) => e.home === 'ground' && e.state === 'idle' && e.busy <= 0 && !e.friend.trick && !e.friend.emoting);
    if (!cands.length) return false;
    const e = pick(cands);
    const f = e.friend;
    // the flower, held in front of its face (in its own units: the object is scaled)
    const { head, stalk } = this.giftGeo ?? (this.giftGeo = flowerGeometries());
    const group = new THREE.Group();
    const col = pick(PETAL_COLORS);
    const hm = new THREE.Mesh(head, new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
    const sm = new THREE.Mesh(stalk, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, vertexColors: true }));
    group.add(hm, sm);
    const size = clamp(f.restRadius * 0.28, 0.02, 0.06);
    hm.scale.setScalar(size * 0.9);
    sm.scale.set(size * 0.8, size * 1.6, size * 0.8);
    sm.position.y = 0;
    hm.position.y = 0.002;
    const b = f.bounds;
    let y = b.min.y + (b.max.y - b.min.y) * 0.4;
    const z = b.max.z + size * 0.6;
    // (a friend that says where to hold it, a doodle, holds it under its smile)
    let x = 0;
    const at = f.giftPoint?.(new THREE.Vector3());
    if (at) {
      x = at.x;
      y = Math.max(b.min.y + size * 2, at.y - size * 1.4);
    }
    group.position.set(x, y, z);
    group.scale.setScalar(0.001);
    f.object.add(group);
    // walk up to the child: the front of the lawn, towards the camera
    const cam = app.camera.position;
    let tx = STAGE.x + (cam.x - STAGE.x) * 0.35;
    let tz = STAGE.z + (cam.z - STAGE.z) * 0.35;
    if (stageAt(tx, tz) > 0) {
      tx = STAGE.x;
      tz = STAGE.z + 0.8;
    }
    const spot = F.nav.nearestFree(tx, tz, 0.16) || { x: tx, z: tz };
    const G = { e, mesh: group, color: col, x, y, z, t: 0, ot: 0, phase: 'go', size };
    this.gift = G;
    F.emote(e, 'sniff');
    F.after(1.2, () => {
      if (this.gift !== G) return;
      group.scale.setScalar(1);
      this.chime([1318, 1760], 0.06, 0.03);
      const ok = F.send(e, spot, {
        pace: 'walk',
        stopR: 0.08,
        onArrive: () => {
          if (this.gift !== G) return;
          G.phase = 'offer';
          G.ot = 0;
          F.emote(e, 'bow');
          app.direct?.(e, 'close', 3.2);
        },
        onCancel: () => this.gift === G && this.endGift(true),
      });
      if (!ok) this.endGift(true);
      e.busy = 12;
    });
    return true;
  }

  endGift(give) {
    const G = this.gift;
    if (!G) return;
    this.gift = null;
    const app = this.app;
    const e = G.e;
    G.mesh.getWorldPosition(_v);
    G.mesh.parent?.remove(G.mesh);
    G.mesh.traverse((o) => o.material?.dispose?.());
    if (!give) return;
    // it floats up to the child and bursts into petals
    const c = new THREE.Color(G.color);
    const cam = app.camera.position;
    _w.copy(cam).sub(_v).normalize();
    for (let i = 0; i < 16; i++) app.fx.petals.throw(_v, _s.set(_w.x * rand(0.6, 1.4) + rand(-0.4, 0.4), rand(0.8, 1.6), _w.z * rand(0.6, 1.4) + rand(-0.4, 0.4)), i % 3 ? c : _c.set(0xffffff), rand(0.01, 0.016));
    app.fx.sparkles.burst(_v, 40, { colors: [[2.0, 1.4, 1.6], [2.0, 1.8, 1.0]], speed: 0.8, up: 0.8, size: 0.02 });
    this.chime([1568, 1976, 2349, 3136], 0.07, 0.035);
    if (!e.leaving) {
      this.friends.emote(e, 'giggle');
      e.busy = 1.2;
    }
  }

  // ------------------------------------------------------------ sound

  chime(notes, gap = 0.08, v = 0.04) {
    const a = this.app.audio;
    if (!a?.ready || !a.ctx || a.muted) return;
    const t = a.ctx.currentTime;
    notes.forEach((f, i) => a.bell(f, v, t + i * gap, 0.8));
  }

  whoosh() {
    const a = this.app.audio;
    if (!a?.ready || !a.ctx || a.muted) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = a.pink;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    n.connect(f).connect(g).connect(a.sfx);
    n.start(t, Math.random());
    n.stop(t + 0.7);
  }

  pop() {
    const a = this.app.audio;
    if (!a?.ready || !a.ctx || a.muted) return;
    const t = a.ctx.currentTime;
    for (let i = 0; i < 5; i++) a.bell(rand(1400, 3200), 0.035, t + i * 0.04, 0.7);
  }

  // ------------------------------------------------------------ debug

  debugApi() {
    const me = this;
    return {
      audience: () => me.gather(true),
      bloom: (x = STAGE.x, z = STAGE.z, n = 3) => me.bloom(x, z, n),
      pond: (x = POND.x + 0.3, z = POND.z + 0.2) => me.pondTap(x, z),
      fireworks: () => {
        const who = me.friends.list.filter((e) => !e.leaving);
        const cam = me.app.camera.position;
        const fx = cam.x - STAGE.x;
        const fz = cam.z - STAGE.z;
        const l = Math.hypot(fx, fz) || 1;
        me.fireworks(STAGE.x, STAGE.z, fx / l, fz / l, who);
      },
      gift: () => me.startGift(),
      giveGift: () => me.endGift(true),
      state: () => ({ audience: me.audience ? me.audience.list.map((s) => ({ kind: s.e.friend.info.id, arrived: s.arrived })) : null, blooms: me.blooms.length, rockets: me.rockets.length, gift: me.gift ? me.gift.phase : null }),
    };
  }
}
