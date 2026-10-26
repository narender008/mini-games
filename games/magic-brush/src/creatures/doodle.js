// A doodle friend: whatever a child drew freely, puffed up into a soft 3D
// plush of its own shape and painted with its own drawing (the body is made in
// src/doodle/inflate.js; src/doodle/doodle.js runs the mode).
//
// It has big googly eyes whose pupils roll after what it looks at and jiggle
// when it bounces, a smile that opens wide when it is excited, rosy cheeks,
// and little legs with round feet under its bottom edge (a long, low noodle
// gets a row of them, like a caterpillar). The body is skinned to a small
// skeleton: hips, chest and head up its height and a lobe at each side (arms,
// a star's points, a noodle's ends), so it squashes and stretches like jelly,
// leans into a walk, waddles, waves and hops.
//
// Tricks: 'wiggle' (a jelly wobble with a giggle), 'wave' (one side waves
// hello), 'twirl' (a spin with its arms out) and 'bounce' (three big boings).
import * as THREE from 'three';
import { Friend, CANVAS_W, CANVAS_H } from './friend.js';
import { hideMaterial, solidMaterial } from './materials.js';
import { tubeGeometry, withLook, bindTo, TINY } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { Spring, bump, ramp, smooth, clamp, TAU } from './anim.js';
import { glide, puff, tone, giggle, sparkle } from '../sound/calls.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const easeSpin = (k) => k * k * (3 - 2 * k);

function attr(g, name, arr, size) {
  g.setAttribute(name, new THREE.BufferAttribute(arr, size));
}

// a body from the mesher's arrays
function bodyGeometry(b) {
  const g = new THREE.BufferGeometry();
  attr(g, 'position', b.position, 3);
  attr(g, 'normal', b.normal, 3);
  attr(g, 'skinIndex', b.skinIndex, 4);
  attr(g, 'skinWeight', b.skinWeight, 4);
  attr(g, 'aTint', b.tint, 3);
  attr(g, 'aMix', b.mix, 4);
  g.setIndex(new THREE.BufferAttribute(b.index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function prep(g, look, bone) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.index) {
    const n = g.attributes.position.count;
    g.setIndex(Array.from({ length: n }, (_, i) => i));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  withLook(g, look);
  bindTo(g, bone);
  return g;
}

export class DoodleFriend extends Friend {
  // data: what doodle/inflate.js buildDoodle() made
  constructor(info, ctx, data) {
    super(info, ctx);
    this.data = data;
    this.walkSpeed = 0.2;
    this.turnRate = 2.6;
    this.hopScale = 1.3;
    this.sparkleColors = [[1.9, 1.5, 0.8], [1.9, 1.0, 1.5], [1.0, 1.5, 1.9]];
    this.phase = 0;
    this.jelly = new Spring(0, 2.6, 0.16);
    this.wob = new Spring(0, 1.9, 0.2);
    this.headYaw = new Spring(0, 1.6, 0.7);
    this.headPitch = new Spring(0, 1.6, 0.7);
    this.sideS = [new Spring(0, 2.2, 0.25), new Spring(0, 2.2, 0.25)];
    this.pupilS = [0, 1].map(() => ({ x: new Spring(0, 3.4, 0.22), y: new Spring(0, 3.4, 0.22) }));
    this.open = 0;
    this.lastY = null;
    this.vy = 0;
    this.lod = 0;
  }

  get tricks() {
    return ['wiggle', 'wave', 'twirl', 'bounce'];
  }

  trickLength(name) {
    return { wiggle: 1.7, wave: 2.1, twirl: 1.5, bounce: 2.0 }[name] || 1.8;
  }

  // ------------------------------------------------------------ building

  async build() {
    const d = this.data;
    // the skeleton, straight from the mesher's bones (no rest rotations)
    const index = {};
    d.bones.forEach((b, i) => (index[b.name] = i));
    const list = d.bones.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      return bone;
    });
    d.bones.forEach((b, i) => {
      if (b.parent) {
        const pp = d.bones[index[b.parent]].pos;
        list[i].position.set(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
        list[index[b.parent]].add(list[i]);
      } else list[i].position.set(...b.pos);
    });
    list[0].updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(list);
    this.boneList = list;
    this.bones = {};
    for (const b of list) this.bones[b.name] = b;
    this.boneIndex = index;
    // (Friend.worldCenter and bonePoint helpers read rest positions from here)
    this.sculptor = { bones: d.bones, index };
    this.object.add(list[0]);

    const q = this.q.tier === 'low' ? 0.7 : 1;
    this.hide = hideMaterial(this.shared, { sheen: 0.75, clearcoat: 0.2 });
    this.shared.uSplat.value = 0.0;
    this.fineGeo = bodyGeometry(d.body);
    this.coarseGeo = d.coarse ? bodyGeometry(d.coarse) : null;
    this.body = this.addMesh(this.fineGeo, this.hide, { shadow: true });

    // legs and round feet: a soft, darker shade of the painting
    if (d.legs.length) {
      const parts = [];
      for (const l of d.legs) {
        const bone = index[l.bone];
        const len = Math.max(0.001, l.top[1] - l.foot[1]);
        const leg = new THREE.CapsuleGeometry(l.r * 0.82, len, 4, Math.round(12 * q));
        leg.translate(l.top[0], (l.top[1] + l.foot[1]) / 2, l.top[2]);
        parts.push(prep(leg, { tint: 0x3a2a26, paint: 0.6, rough: 0.7 }, bone));
        const foot = new THREE.SphereGeometry(1, Math.round(18 * q), Math.round(12 * q));
        foot.scale(l.r * 1.45, l.r * 0.9, l.r * 2.0);
        foot.translate(l.foot[0], l.foot[1], l.foot[2]);
        parts.push(prep(foot, { tint: 0x2e2220, paint: 0.5, rough: 0.66 }, bone));
      }
      this.legMesh = this.addMesh(mergeGeometries(parts), this.hide, { shadow: true });
    }

    // googly eyes: a white dome with a dark rim and a loose black pupil
    const eyeParts = [];
    this.eyeInfo = [];
    for (const e of d.eyes) {
      const n = e.c[0] >= 0 ? 'L' : 'R';
      const side = d.eyes.indexOf(e);
      const eb = index['eye' + n];
      const pb = index['pupil' + n];
      const white = new THREE.SphereGeometry(e.r, Math.round(30 * q), Math.round(18 * q));
      white.scale(1, 1, 0.5);
      white.translate(...e.c);
      eyeParts.push(prep(white, { tint: 0xfdfcf8, rough: 0.22 }, eb));
      const ring = new THREE.TorusGeometry(e.r * 0.985, e.r * 0.075, 6, Math.round(40 * q));
      ring.translate(e.c[0], e.c[1], e.c[2] + e.r * 0.02);
      eyeParts.push(prep(ring, { tint: 0x2a2030, rough: 0.4 }, eb));
      const pr = e.r * 0.5;
      const pupil = new THREE.SphereGeometry(pr, Math.round(20 * q), Math.round(12 * q));
      pupil.scale(1, 1, 0.32);
      pupil.translate(e.c[0], e.c[1], e.c[2] + e.r * 0.5 - pr * 0.12);
      eyeParts.push(prep(pupil, { tint: 0x120e16, rough: 0.12 }, pb));
      this.eyeInfo.push({ n, c: new THREE.Vector3(...e.c), r: e.r, pr, side });
    }
    this.eyeMesh = this.addMesh(mergeGeometries(eyeParts), solidMaterial(this.shared, { clearcoat: 1 }), { shadow: false });
    this.eyeMesh.userData.noProject = true;

    // the smile, an open mouth that shows when it is excited, rosy cheeks
    const faceParts = [];
    if (d.mouth) {
      const mb = index.mouth;
      const n = d.mouth.pts.length;
      const radii = d.mouth.pts.map((_, i) => {
        const u = (i / (n - 1)) * 2 - 1;
        return d.mouth.r * (0.7 + 0.3 * (1 - u * u));
      });
      const smile = tubeGeometry(d.mouth.pts, radii, { radial: 8, steps: 18 });
      faceParts.push(prep(smile, { tint: 0x3a1822, rough: 0.5 }, mb));
      const c = d.mouth.c;
      const w = d.mouth.w;
      const gape = new THREE.SphereGeometry(1, 16, 10);
      gape.scale(w * 0.62, w * 0.55, w * 0.18);
      const gc = [c[0], c[1] - w * 0.12, c[2] + w * 0.02];
      gape.translate(gc[0], gc[1], gc[2]);
      // (shrunk to a speck round its bone, and grown by the bone when it opens)
      gape.translate(-gc[0], -gc[1], -gc[2]).scale(TINY, TINY, TINY).translate(gc[0], gc[1], gc[2]);
      faceParts.push(prep(gape, { tint: 0x7a2236, rough: 0.45 }, index.gape));
      // the gape bone sits at its middle
      this.bones.gape.position.set(gc[0] - c[0], gc[1] - c[1], gc[2] - c[2]);
    }
    for (const ch of d.cheeks) {
      const g = new THREE.SphereGeometry(ch.r, 14, 10);
      g.scale(1, 0.72, 0.28);
      g.translate(...ch.c);
      faceParts.push(prep(g, { tint: 0xff8aa0, rough: 0.92 }, index.head));
    }
    if (faceParts.length) {
      this.faceMesh = this.addMesh(mergeGeometries(faceParts), solidMaterial(this.shared, {}), { shadow: false });
      this.faceMesh.userData.noProject = true;
    }

    this.computeProjection();
    // (the gape bone moved above: the bind matrices need the bones where they are now)
    list[0].updateMatrixWorld(true);
    this.skeleton.calculateInverses();
    for (const m of this.meshes) m.bind(this.skeleton, new THREE.Matrix4());
    const rest = this.bounds.getBoundingSphere(new THREE.Sphere());
    this.restRadius = rest.radius;
    for (const m of this.meshes) m.boundingSphere = rest.clone();
    // a stride long enough that the feet do not slide
    const l0 = d.legs[0];
    this.stride = l0 ? Math.max(0.03, (l0.top[1] - l0.foot[1]) * 2.4 + l0.r * 2) : 0.06;
    this.legLift = l0 ? l0.r * 1.2 : 0.008;
    return this;
  }

  // The painting lies on the canvas exactly where it was drawn: the rest pose,
  // seen from the front, maps back onto the drawing (no fitting into a frame).
  computeProjection() {
    const box = new THREE.Box3();
    for (const m of this.meshes) {
      if (m.userData.noProject) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox);
    }
    this.bounds = box;
    const ha = 0, va = 1, hs = 1;
    this.axes = [ha, va, hs];
    this.extentH = box.max.x - box.min.x;
    const f = 1 / this.data.scale;
    const mh = 0, mv = 0;
    const [oh, ov] = this.data.origin;
    this.fit = { f, mh, mv, ha, va, hs, oh, ov };
    const e = new Array(16).fill(0);
    e[ha] = (hs * f) / CANVAS_W;
    e[3] = 0.5 + (oh - mh * f) / CANVAS_W;
    e[4 + va] = f / CANVAS_H;
    e[7] = 0.5 + (ov - mv * f) / CANVAS_H;
    e[10] = 1;
    e[15] = 1;
    this.shared.uPaintMat.value.set(...e);
    const pe = new Array(16).fill(0);
    pe[ha] = hs * f;
    pe[3] = oh - mh * f;
    pe[4 + va] = f;
    pe[7] = ov - mv * f;
    pe[11] = 0.004;
    pe[15] = 1;
    this.restToPlane = new THREE.Matrix4().set(...pe);
    this.canvasBasis = new THREE.Matrix4().identity();
  }

  // ------------------------------------------------------------ per frame

  update(dt, camera) {
    // how fast it is going up or down (for the googly pupils)
    const y = this.object.position.y;
    if (this.lastY !== null && dt > 0) this.vy = (y - this.lastY) / dt;
    this.lastY = y;
    super.update(dt, camera);
    if (camera) this.fitLod(camera);
  }

  // the coarse body when it is small on screen
  fitLod(camera) {
    if (!this.coarseGeo) return;
    this.object.getWorldPosition(_v);
    const d = _v.distanceTo(camera.position);
    const px = (this.restRadius * this.object.scale.x) / (d * Math.tan((camera.fov * Math.PI) / 360));
    const want = this.lod ? (px > 0.27 ? 0 : 1) : px < 0.22 ? 1 : 0;
    if (want !== this.lod) {
      this.lod = want;
      this.body.geometry = want ? this.coarseGeo : this.fineGeo;
    }
  }

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    const sp = m.speed;
    const air = m.air;
    const w = clamp(sp / Math.max(0.05, this.walkSpeed), 0, 1.5);
    this.phase += dt * (sp / this.stride) * Math.PI;
    const ph = this.phase;

    // breathing, and a slow sway
    const br = Math.sin(t * 2.1);
    B.chest.scale.set(1 + br * 0.02, 1 + br * 0.014, 1 + br * 0.02);
    B.hips.rotation.z += Math.sin(t * 1.1) * 0.025 * (1 - w);

    // jelly: what kicked it (a landing, a tap) wobbles away
    const j = this.jelly.update(0, dt);
    const wb = this.wob.update(0, dt);
    B.hips.scale.set(1 + j * 0.5, 1 - j, 1 + j * 0.5);
    B.hips.rotation.z += wb * 0.12;

    // walking: a bouncy waddle, leaning in, the feet stepping in turn
    if (w > 0.01) {
      const bob = Math.abs(Math.sin(ph));
      B.hips.position.y += bob * this.legLift * 1.1 * Math.min(1, w);
      B.root.rotation.z += Math.sin(ph) * 0.07 * Math.min(1, w);
      B.chest.rotation.x += 0.1 * Math.min(1, w);
      const sq = (1 - bob) * 0.05 * Math.min(1, w);
      B.hips.scale.multiply(_v.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5));
    }
    const legs = this.data.legs;
    for (let i = 0; i < legs.length; i++) {
      const b = B[legs[i].bone];
      const p = ph + (i % 2) * Math.PI + (legs.length > 2 ? Math.floor(i / 2) * 0.6 : 0);
      b.rotation.x = Math.sin(p) * 0.5 * Math.min(1, w);
      b.position.y += Math.max(0, Math.cos(p)) * this.legLift * Math.min(1, w);
      // tucked up in a leap
      b.rotation.x -= 0.55 * air;
      b.position.y += air * this.legLift * 0.8;
    }

    // side lobes: flutter, swing with the steps, fling up in the air
    for (let s = 0; s < 2; s++) {
      const sgn = s ? -1 : 1;
      const b = s ? B.sideR : B.sideL;
      const spring = this.sideS[s].update(0, dt);
      b.rotation.z += sgn * (Math.sin(t * 1.7 + s * 2.1) * 0.05 + Math.sin(ph) * 0.16 * Math.min(1, w) * sgn + 0.6 * air) + spring * 0.4;
    }

    // the head turns a little to what it looks at
    let yawT = Math.sin(t * 0.37) * 0.12;
    let pitchT = 0;
    if (this.lookLocal) {
      yawT = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z) * 0.4, -0.35, 0.35);
      pitchT = clamp(-(this.lookLocal.y - this.data.heightRest * 0.7) * 0.6, -0.2, 0.2);
    }
    B.head.rotation.y += this.headYaw.update(yawT, dt);
    B.head.rotation.x += this.headPitch.update(pitchT, dt) * 0.6;

    // stretched in flight
    if (air > 0) B.hips.scale.multiply(_v.set(1 - air * 0.05, 1 + air * 0.1, 1 - air * 0.05));

    // excited: the mouth opens
    let open = Math.max(air * 0.9, this.happy.x > 0.6 ? 0.35 : 0);
    if (this.emoting === 'cheer' || this.emoting === 'giggle') open = Math.max(open, 0.9 * Math.sin(Math.PI * clamp(this.emoteState.t / this.emoteState.dur, 0, 1)));
    if (this.trick) open = Math.max(open, this.trickOpen(this.trick));
    if (this.trick?.name === 'hello') open = Math.max(open, 0.7);
    this.open += (open - this.open) * (1 - Math.exp(-dt * 10));
    if (B.gape) B.gape.scale.setScalar(1 + (1 / TINY - 1) * this.open);
    if (B.mouth) B.mouth.scale.set(1 + this.open * 0.15, 1, 1);

    if (this.trick) this.trickPose(this.trick, dt);
  }

  trickOpen(tr) {
    const k = tr.t / tr.dur;
    if (tr.name === 'wiggle' || tr.name === 'bounce' || tr.name === 'twirl') return bump(k, 0.05, 0.95) * 0.9;
    if (tr.name === 'wave') return bump(k, 0.1, 0.8) * 0.6;
    return 0;
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    const k = clamp(t / tr.dur, 0, 1);
    const env = Math.sin(Math.PI * k);
    if (tr.name === 'wiggle') {
      // a jelly wobble, side to side and up and down
      const wv = Math.sin(t * 19) * env;
      B.hips.scale.multiply(_v.set(1 + wv * 0.08, 1 - wv * 0.1, 1 + wv * 0.08));
      B.root.rotation.z += Math.sin(t * 11) * 0.13 * env;
      B.head.rotation.z += Math.sin(t * 11 + 1) * 0.1 * env;
      B.sideL.rotation.z += Math.sin(t * 16) * 0.3 * env;
      B.sideR.rotation.z -= Math.sin(t * 16 + 1) * 0.3 * env;
      this.blinker.hold = env > 0.35 ? 0.85 : 0;
      if (!tr.a) {
        tr.a = true;
        this.emit('sound', { name: 'wiggle' });
      }
      if (k > 0.97 && !tr.b) {
        tr.b = true;
        this.blinker.hold = 0;
      }
      return;
    }
    if (tr.name === 'wave') {
      // up goes one side, waving hello
      const up = ramp(t, 0.05, 0.4) * (1 - ramp(t, 1.6, 2.05));
      const wave = Math.sin((t - 0.4) * 15) * ramp(t, 0.35, 0.5) * (1 - ramp(t, 1.45, 1.7));
      B.sideL.rotation.z += up * 0.85 + wave * 0.32;
      B.sideR.rotation.z -= up * 0.12;
      B.head.rotation.z -= up * 0.1;
      B.root.rotation.z += up * 0.05;
      const bounce = Math.abs(Math.sin((t - 0.3) * 7.5)) * bump(t, 0.3, 1.8);
      B.root.position.y += bounce * this.legLift * 1.2;
      if (!tr.a && t > 0.2) {
        tr.a = true;
        this.emit('sound', { name: 'hello' });
        this.emit('sparkle', { at: this.restPoint('sideL', [0, 0, 0.02]), count: 14, speed: 0.6, up: 0.6, size: 0.016 });
      }
      return;
    }
    if (tr.name === 'twirl') {
      B.root.rotation.y += easeSpin(clamp((t - 0.1) / 1.1, 0, 1)) * TAU;
      const hop = Math.max(0, Math.sin(clamp((t - 0.1) / 1.1, 0, 1) * Math.PI)) ** 2;
      B.root.position.y += hop * this.data.heightRest * 0.18;
      B.sideL.rotation.z += env * 0.7;
      B.sideR.rotation.z -= env * 0.7;
      if (!tr.a) {
        tr.a = true;
        this.emit('sound', { name: 'twirl' });
      }
      if (!tr.b && t > 1.2) {
        tr.b = true;
        this.touchDown(1.5);
        this.emit('sparkle', { at: this.restPoint('root', [0, 0, 0]), count: 18, speed: 0.6, up: 0.5, size: 0.016 });
      }
      return;
    }
    if (tr.name === 'bounce') {
      // three boings, each squashing on the way down
      const n = 3;
      const ph = clamp(t / (tr.dur * 0.92), 0, 1) * n;
      const i = Math.floor(ph);
      const f = ph - i;
      const h = Math.max(0, Math.sin(f * Math.PI)) ** 2 * this.data.heightRest * (0.32 - i * 0.06);
      B.root.position.y += i < n ? h : 0;
      B.sideL.rotation.z += Math.sin(f * Math.PI) * 0.5;
      B.sideR.rotation.z -= Math.sin(f * Math.PI) * 0.5;
      tr.hops ??= 0;
      if (i > tr.hops - 1 && i < n) {
        tr.hops = i + 1;
        if (i > 0) this.touchDown(2);
        this.emit('sound', { name: 'boing' });
      }
      if (ph >= n && !tr.end) {
        tr.end = true;
        this.touchDown(2.2);
      }
    }
  }

  // eyes: pupils roll after what it looks at and jiggle when it bounces; lids
  // are a quick squash of the whole eye
  poseEyes(dt, camera) {
    const blink = this.blinker.update(dt);
    const target = this.look || camera?.position;
    const B = this.bones;
    // the target in the friend's own space
    let lx = 0, ly = 0, lz = 1;
    if (target) {
      this.object.updateWorldMatrix(true, false);
      _v.copy(target);
      this.object.worldToLocal(_v);
    }
    const kick = clamp(-this.vy * 0.05, -0.2, 0.2);
    for (const e of this.eyeInfo) {
      if (target) {
        lx = _v.x - e.c.x;
        ly = _v.y - e.c.y;
        lz = _v.z - e.c.z;
      }
      const l = Math.hypot(lx, ly, lz) || 1;
      const zf = Math.max(0.3, lz / l);
      const max = (e.r - e.pr) * 0.82;
      let ox = clamp(((lx / l) / zf) * max * 0.9, -max, max);
      let oy = clamp(((ly / l) / zf) * max * 0.9, -max, max);
      const ps = this.pupilS[e.side];
      ps.y.kick(kick * e.r * 30 * dt * 60 * 0.016);
      ox = ps.x.update(ox, dt);
      oy = ps.y.update(oy, dt);
      const rho = Math.hypot(ox, oy);
      if (rho > max) {
        ox *= max / rho;
        oy *= max / rho;
      }
      const r2 = Math.min(1, (ox * ox + oy * oy) / (e.r * e.r));
      const dz = e.r * 0.5 * (Math.sqrt(1 - r2) - 1);
      const pb = B['pupil' + e.n];
      pb.position.set(ox, oy, dz);
      const eb = B['eye' + e.n];
      eb.scale.set(1, Math.max(0.1, 1 - 0.9 * blink), 1);
    }
  }

  // a bump: the body wobbles like jelly, the pupils jiggle
  touchDown(s = 1) {
    this.jelly.kick(s * 1.1);
    this.wob.kick((Math.random() - 0.5) * s * 0.8);
    for (const p of this.pupilS) {
      p.y.kick(-s * 0.05 * (this.eyeInfo[0]?.r ?? 0.02) * 60);
      p.x.kick((Math.random() - 0.5) * s * 0.03 * (this.eyeInfo[0]?.r ?? 0.02) * 60);
    }
    this.sideS[0].kick(s * 0.6);
    this.sideS[1].kick(-s * 0.6);
  }

  emote(name, dur) {
    const ok = super.emote(name, dur);
    if (ok && (name === 'hop' || name === 'cheer')) this.jelly.kick(0.6);
    return ok;
  }

  startTrick(name, dur) {
    super.startTrick(name, dur);
    this.jelly.kick(0.8);
  }

  // a world point at an offset from a bone (in its rest frame)
  restPoint(bone, off) {
    return this.bonePoint(bone, off);
  }

  dispose() {
    super.dispose();
    if (this.body.geometry !== this.fineGeo) this.fineGeo.dispose();
    if (this.coarseGeo && this.body.geometry !== this.coarseGeo) this.coarseGeo.dispose();
  }
}

export default DoodleFriend;

// ------------------------------------------------------------ its voice

// Every doodle sounds like itself: a voice worked out from its shape (round
// ones boop low and soft, spiky ones chirp high, long ones slide like a
// whistle) and a seed, so the same doodle always sounds the same.
export function voiceFor(stats, seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const round = clamp(stats?.round ?? 0.8, 0, 1);
  const aspect = Math.max(stats?.aspect ?? 1, 1 / (stats?.aspect ?? 1));
  const long = clamp((aspect - 1.6) / 2, 0, 1);
  const spiky = clamp((0.95 - round) * 2.5, 0, 1);
  const base = 480 + rnd() * 240 + spiky * 420 + long * 120;
  const trill = rnd() < 0.45 ? 22 + rnd() * 14 : 0;
  const kind = long > 0.35 ? 'whistle' : spiky > 0.4 ? 'chirp' : 'boop';
  const formant = base * (1.6 + rnd() * 0.6);
  const say = (a, t, pts, v = 0.09) => glide(a, t, pts.map(([dt, k]) => [dt, base * k]), { v, type: kind === 'chirp' ? 'triangle' : 'sine', formant, q: 1, trill, trillDepth: 0.5, breath: 0.15 });
  const notes = {
    boop: [[[0, 1], [0.12, 1.25], [0.24, 1.1]], [[0, 1.3], [0.1, 1.6], [0.22, 1.45]]],
    chirp: [[[0, 1.2], [0.06, 1.7], [0.12, 1.4]], [[0, 1.5], [0.05, 2.0], [0.11, 1.7]]],
    whistle: [[[0, 0.8], [0.25, 1.7], [0.4, 1.3]], [[0, 1.4], [0.18, 1.0], [0.3, 1.5]]],
  }[kind];
  return {
    happy(a, t) {
      say(a, t, notes[0]);
      say(a, t + 0.24, notes[1], 0.075);
    },
    hello(a, t) {
      say(a, t, notes[0]);
      say(a, t + 0.2, notes[1], 0.08);
      a.bell(base * 3, 0.025, t + 0.42, 0.6);
    },
    giggle(a, t) {
      giggle(a, t, base * 1.2);
    },
    wiggle(a, t) {
      glide(a, t, [[0, base], [0.15, base * 1.3], [0.3, base * 0.95], [0.45, base * 1.35], [0.62, base * 1.05]], { v: 0.08, type: 'sine', formant, q: 0.9, vibrato: base * 0.06 });
      giggle(a, t + 0.6, base * 1.3);
    },
    twirl(a, t) {
      puff(a, t, { v: 0.06, from: 600, to: 2200, dur: 0.7 });
      glide(a, t, [[0, base * 0.8], [0.5, base * 2.0], [0.9, base * 1.4]], { v: 0.07, type: 'sine', formant: base * 2, q: 0.8 });
      sparkle(a, t + 0.9, 4, base * 2.5, base);
    },
    boing(a, t) {
      glide(a, t, [[0, base * 0.45], [0.09, base * 1.2], [0.28, base * 0.6]], { v: 0.09, formant: base * 1.6, q: 0.7, vibrato: 30, type: 'sine' });
    },
    thump(a, t) {
      tone(a, t, 170, 70, 0.18, { v: 0.12, lp: 500 });
    },
    // the moment it comes alive: a little "ooh!" that rises
    ooh(a, t) {
      say(a, t, [[0, 0.9], [0.3, 1.5], [0.45, 1.35]], 0.09);
    },
  };
}
