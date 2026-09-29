// The base for every friend that can be painted alive. A subclass describes
// its body (sculpt), its rigid and thin parts (parts) and how it moves
// (animate, tricks); this class turns that into skinned meshes sharing one
// skeleton, fur shells for furry friends, eyes that look about and blink,
// and the bookkeeping the world and the come-alive moment need.
//
// Space: a friend faces +z, y is up and its feet rest on y = 0. The painting
// is projected onto it along its canvas view ('side': +z to the right of
// the canvas; 'front': +x to the right; 'top': +x right and +z up the
// canvas), fitted to the canvas with a margin.
import * as THREE from 'three';
import { Sculpt } from './sculpt.js';
import { friendUniforms, hideMaterial, shellMaterial, eyeMaterial, solidMaterial, membraneMaterial, depthMaterial } from './materials.js';
import { eyeGeometry, lidGeometry, bindTo } from './parts.js';
import { Blinker, Spring, Eased, Inertia } from './anim.js';

export const CANVAS_W = 0.64;
export const CANVAS_H = 0.48;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const Z = new THREE.Vector3(0, 0, 1);
const _s = new THREE.Vector3();
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// how long each generic emote lasts (s)
const EMOTES = { hop: 0.9, cheer: 1.5, giggle: 1.1, spin: 1.0, eat: 1.6, nuzzle: 1.4, sniff: 1.4, bow: 1.2 };
// a full turn that eases in and out
const easeSpin = (k) => k * k * (3 - 2 * k);

export class Friend {
  // info: { id, name, view, ... } (the subject's catalogue entry)
  // ctx: { quality, alphaToCoverage }
  constructor(info, ctx) {
    this.info = info;
    this.ctx = ctx;
    this.q = ctx.quality;
    this.shared = friendUniforms();
    this.object = new THREE.Group();
    this.object.name = info.id;
    this.meshes = [];
    this.shells = [];
    this.eyes = [];
    this.lids = [];
    this.events = [];
    this.t = Math.random() * 10;
    this.blinker = new Blinker();
    // What the world tells the pose about how the friend moves. `speed` and
    // `air` are written in steps now and then (a trick stops a walk dead, the
    // come-alive jumps from crouch to leap), so they are read back eased: every
    // pose built from them is continuous whatever is written (see Eased).
    this.motion = { turn: 0, vy: 0, fly: 0, swim: 0, landed: 0 };
    this.eased = { speed: new Eased(5, 5, 0), air: new Eased(6, 5, 0, 1) };
    for (const k of Object.keys(this.eased)) {
      const e = this.eased[k];
      Object.defineProperty(this.motion, k, { get: () => e.value, set: (v) => (e.raw = v), enumerable: true });
    }
    this.look = null; // world point to look at, or null
    this.trick = null; // { name, t, dur }
    this.happy = new Spring(0, 1.5, 0.9);
    this.shellsShown = 0;
    // settings a subclass may change in its constructor
    this.furry = false;
    this.hideOpts = {};
    this.voxelScale = 1;
    this.smoothRounds = 8;
    // how it gets about in the world: walking pace in m/s (0: stays where it
    // is, like a flower), how fast it turns (rad/s), and its size once home
    // (a painted tree grows, a sun rises big into the sky)
    this.walkSpeed = 0.28;
    this.runSpeed = 0; // m/s at a run (0: 2.6 x walkSpeed); see get run()
    this.turnRate = 2.4;
    this.worldScale = 1;
    this.hopScale = 1; // how high hello and goodbye hops go
    // how it gets about: 'legs' (walks and runs), 'fly', 'hop' (a hopping
    // journey, for friends without legs), 'drive', 'float' (rises, for sky friends)
    this.style = 'legs';
    this.flyHeight = 0; // metres above the ground it cruises at, for style 'fly'
    this.emoteState = null; // { name, t, dur } while a generic emote plays
  }

  // how big it is once out to play: a pet a child can hug, so friends are sized
  // by their bounding radius (a tiny whale and a long dragon come out about the
  // same armful) and the garden camera can frame them close and full of face
  get landScale() {
    return Math.max(1, Math.min(3.6, 0.5 / (this.restRadius || 0.3)));
  }

  // speed at a run
  get run() {
    return this.runSpeed || this.walkSpeed * 2.6;
  }

  // ------------------------------------------------------------ to override

  sculpt(/* s */) {}
  parts(/* s */) {}
  animate(/* dt */) {}
  get tricks() {
    return ['hop'];
  }

  // ------------------------------------------------------------ building

  async build() {
    const s = new Sculpt();
    this.sculpt(s);
    this.sculptor = s;
    const geo = await s.build({ voxel: this.q.voxel * this.voxelScale, smooth: this.smoothRounds });
    const sk = s.skeleton();
    this.skeleton = sk.skeleton;
    this.bones = sk.bones;
    this.boneList = sk.list;
    this.object.add(sk.root);
    this.boneIndex = s.index;
    this.hide = hideMaterial(this.shared, { ...this.hideOpts, furry: this.furry });
    this.body = this.addMesh(geo, this.hide, { shadow: true });
    this.parts(s);
    if (this.furry && this.q.fur > 0) this.addShells(geo);
    this.computeProjection();
    this.skeleton.calculateInverses();
    for (const m of this.meshes) m.bind(this.skeleton, new THREE.Matrix4());
    const rest = this.bounds.getBoundingSphere(new THREE.Sphere());
    this.restRadius = rest.radius;
    // three.js works out a skinned mesh's bounding sphere by skinning every one of its vertices on the CPU the
    // first time it is drawn: about 2 ms a mesh, so 75 ms in the first frame of a furry friend (the body and its
    // 26 shells share one geometry). The rest pose sphere is all the draw order needs.
    this.body.boundingSphere = rest.clone();
    for (const m of this.shells) m.boundingSphere = rest.clone();
    return this;
  }

  addMesh(geometry, material, { shadow = true, receive = true } = {}) {
    const m = new THREE.SkinnedMesh(geometry, material);
    m.frustumCulled = false;
    m.castShadow = shadow;
    m.receiveShadow = receive;
    if (shadow) m.customDepthMaterial = this._depth || (this._depth = depthMaterial(this.shared));
    this.object.add(m);
    this.meshes.push(m);
    return m;
  }

  addShells(geo) {
    const n = this.q.fur;
    const a2c = (this.q.msaa || 0) > 0;
    this.shared.uShellCount.value = n;
    for (let i = 1; i <= n; i++) {
      const m = this.addMesh(geo, shellMaterial(this.shared, i / n, a2c), { shadow: false, receive: this.q.tier !== 'low' });
      // drawn from the outermost shell inwards: the picture is the same (every
      // shell is depth tested), but a strand tip already drawn hides what lies
      // behind it before that is shaded, which spares much of the fur's cost
      m.renderOrder = n + 1 - i;
      this.shells.push(m);
    }
    this.shellsShown = n;
  }

  // materials for parts
  mat(kind, opts = {}) {
    if (kind === 'hide') return this.hide;
    if (kind === 'solid') return solidMaterial(this.shared, opts);
    if (kind === 'membrane') return membraneMaterial(this.shared, opts);
    if (kind === 'eye') return eyeMaterial(this.shared, opts);
    throw new Error(kind);
  }

  // A pair of eyes (and lids) on the head bone. c: centre of the left eye
  // (+x); dir: where it looks. The right one is mirrored.
  addEyes(s, { c, r, dir, bone = 'head', iris, iris2, irisSize, pupil, glint, lid = {} }) {
    const mat = eyeMaterial(this.shared, { iris, iris2, irisSize, pupil, glint });
    for (const side of [1, -1]) {
      const cc = [c[0] * side, c[1], c[2]];
      const dd = [dir[0] * side, dir[1], dir[2]];
      const g = bindTo(eyeGeometry(cc, r, dd), s.index[`eye${side > 0 ? 'L' : 'R'}`]);
      const mesh = this.addMesh(g, mat, { shadow: false });
      this.eyes.push({ mesh, bone: this.bonesLater(`eye${side > 0 ? 'L' : 'R'}`), rest: new THREE.Vector3(...dd).normalize(), c: new THREE.Vector3(...cc) });
      const l = lidGeometry(cc, r, dd, lid);
      bindTo(l.geometry, s.index[`lid${side > 0 ? 'L' : 'R'}`]);
      this.addMesh(l.geometry, this.hide, { shadow: false });
      this.lids.push({ bone: this.bonesLater(`lid${side > 0 ? 'L' : 'R'}`), axis: l.axis, open: lid.open ?? 0, closed: lid.closed ?? 1.55 });
    }
    this.eyeBone = bone;
  }

  // bone lookup that works once the skeleton exists
  bonesLater(name) {
    return { get: () => this.bones[name] };
  }

  // eye bones and lid bones for addEyes, at the eye centre
  eyeBones(s, c, bone = 'head') {
    s.bones2('eye', bone, c);
    s.bones2('lid', bone, c);
  }

  // The painting's projection: the friend's rest pose seen along its canvas
  // view, fitted into the canvas with a margin (or into rect: [u0, v0, u1,
  // v1], the part of the canvas a free painting covers).
  //   side:  canvas right = +z, up = +y (its right side, -x, faces out)
  //   front: canvas right = +x, up = +y (it faces out of the canvas)
  //   top:   canvas right = -x, up = +z (seen from above, back to the viewer)
  computeProjection(rect = null) {
    const box = new THREE.Box3();
    for (const m of this.meshes) {
      if (m.userData.noProject) continue;
      // (a friend's fur shells share the body's geometry: measure each geometry once)
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox);
    }
    this.bounds = box;
    const view = this.info.view || 'side';
    const [ha, va, hs] = view === 'side' ? [2, 1, 1] : view === 'top' ? [0, 2, -1] : [0, 1, 1];
    this.axes = [ha, va, hs];
    const min = box.min.toArray();
    const max = box.max.toArray();
    const eh = max[ha] - min[ha];
    const ev = max[va] - min[va];
    this.extentH = eh;
    let cu = 0.5, cv = 0.5, aw = CANVAS_W, ah = CANVAS_H;
    let margin = this.info.margin ?? 0.84;
    if (rect) {
      cu = (rect[0] + rect[2]) / 2;
      cv = (rect[1] + rect[3]) / 2;
      aw = Math.max(0.2, rect[2] - rect[0]) * CANVAS_W;
      ah = Math.max(0.2, rect[3] - rect[1]) * CANVAS_H;
      margin = 1;
    }
    const f = Math.min((margin * aw) / eh, (margin * ah) / ev);
    const mh = hs * (max[ha] + min[ha]) / 2;
    const mv = (max[va] + min[va]) / 2;
    const oh = (cu - 0.5) * CANVAS_W;
    const ov = (cv - 0.5) * CANVAS_H;
    this.fit = { f, mh, mv, ha, va, hs, oh, ov };
    // canvas metres from the canvas centre: (hs*p[ha]-mh)*f + oh, (p[va]-mv)*f + ov
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
    // the rotation that lays the friend on the canvas (rest axes -> canvas axes)
    const cols = view === 'side' ? [[0, 0, -1], [0, 1, 0], [1, 0, 0]] : view === 'top' ? [[-1, 0, 0], [0, 0, 1], [0, 1, 0]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    this.canvasBasis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...cols[0]), new THREE.Vector3(...cols[1]), new THREE.Vector3(...cols[2]));
  }

  // the canvas uv (0..1) of a rest-space point
  paintUv(p) {
    const f = this.fit;
    const a = [p.x, p.y, p.z];
    return [((f.hs * a[f.ha] - f.mh) * f.f + f.oh) / CANVAS_W + 0.5, ((a[f.va] - f.mv) * f.f + f.ov) / CANVAS_H + 0.5];
  }

  // where the friend's object sits (in the canvas plane's own space) so that
  // its rest pose lines up with its painting
  canvasPose() {
    const f = this.fit;
    const m = this.canvasBasis.clone().scale(new THREE.Vector3(f.f, f.f, f.f));
    // a rest point on the centre line at (mh, mv) lands on (oh, ov)
    const p = [0, 0, 0];
    p[f.ha] = f.hs * f.mh;
    p[f.va] = f.mv;
    const v = new THREE.Vector3(...p).applyMatrix4(m);
    m.setPosition(f.oh - v.x, f.ov - v.y, 0.004 - v.z);
    return m;
  }

  setSkin(texture) {
    this.shared.tSkin.value = texture;
  }

  // ------------------------------------------------------------ per frame

  // dt: seconds. camera: for fur detail and eye contact.
  update(dt, camera) {
    this.t += dt;
    this.frameDt = dt;
    this.shared.uTime.value = this.t;
    // bones start from rest every frame; animate() poses them
    for (const b of this.boneList) {
      b.rotation.set(0, 0, 0);
      b.scale.set(1, 1, 1);
    }
    this.restPositions ??= this.boneList.map((b) => b.position.clone());
    this.boneList.forEach((b, i) => b.position.copy(this.restPositions[i]));
    if (this.trick) {
      this.trick.t += dt;
      if (this.trick.t >= this.trick.dur) this.trick = null;
    }
    // the look target in the friend's own space, for heads that follow it
    if (this.look) {
      this.object.updateWorldMatrix(true, false);
      this.lookLocal = (this.lookLocal || new THREE.Vector3()).copy(this.look);
      this.object.worldToLocal(this.lookLocal);
    } else this.lookLocal = null;
    for (const k in this.eased) this.eased[k].step(dt);
    // 0 at a walk .. 1 at a run, for gaits that change with pace
    this.motion.run = clamp01((this.motion.speed - this.walkSpeed) / Math.max(1e-3, this.run - this.walkSpeed));
    this.animate(dt);
    if (this.trick && (this.trick.name === 'hello' || this.trick.name === 'bye')) this.greet(this.trick);
    if (this.emoteState) this.playEmote(this.emoteState, dt);
    this.poseEyes(dt, camera);
    // whatever still jumped is cross-faded from where the bones were heading
    (this.inertia ??= new Inertia(this.boneList)).apply(dt);
    this.shared.uHappy.value = Math.max(0, this.happy.update(0, dt));
    if (camera && this.shells.length) this.fitShells(camera);
  }

  // eyes follow the look target (or wander), lids blink
  poseEyes(dt, camera) {
    if (!this.eyes.length) return;
    const blink = this.blinker.update(dt);
    const head = this.bones[this.eyeBone];
    let target = this.look;
    if (!target && camera) target = camera.position;
    head.updateWorldMatrix(true, false);
    for (const e of this.eyes) {
      const bone = e.bone.get();
      if (target) {
        _m.copy(head.matrixWorld).invert();
        _v.copy(target).applyMatrix4(_m); // target in head space
        // eye centre in head space: rest centre minus the head bone's rest position
        const hp = this.sculptor.bones[this.sculptor.index[this.eyeBone]].pos;
        _w.set(e.c.x - hp[0], e.c.y - hp[1], e.c.z - hp[2]);
        _v.sub(_w).normalize();
        // limit how far the eyes turn from rest
        const cos = _v.dot(e.rest);
        const lim = Math.cos(0.45);
        if (cos < lim) {
          _w.copy(_v).sub(e.rest.clone().multiplyScalar(cos)).normalize();
          _v.copy(e.rest).multiplyScalar(lim).addScaledVector(_w, Math.sqrt(1 - lim * lim));
        }
        _q.setFromUnitVectors(e.rest, _v);
        e.q = e.q || new THREE.Quaternion();
        e.q.slerp(_q, 1 - Math.exp(-dt * 14));
        bone.quaternion.copy(e.q);
      }
    }
    for (const l of this.lids) {
      const bone = l.bone.get();
      const a = l.open + (l.closed - l.open) * blink;
      _q.setFromAxisAngle(l.axis, a);
      bone.quaternion.copy(_q);
    }
  }

  // fewer fur shells when the friend is small on screen
  fitShells(camera) {
    this.object.getWorldPosition(_v);
    const d = _v.distanceTo(camera.position);
    const px = (this.restRadius * this.object.scale.x) / (d * Math.tan((camera.fov * Math.PI) / 360));
    const n = this.shells.length;
    const want = Math.max(Math.min(n, 4), Math.round(n * Math.min(1, px * 1.6)));
    const strain = this.ctx.strain?.() ?? 0;
    const shown = Math.max(3, Math.round(want * (1 - strain * 0.6)));
    if (shown !== this.shellsShown) {
      this.shellsShown = shown;
      // keep an even spread of shells from root to tip
      for (let i = 0; i < n; i++) {
        const keep = Math.floor(((i + 1) * shown) / n) !== Math.floor((i * shown) / n);
        this.shells[i].visible = keep;
      }
    }
  }

  // every friend can say hello (just come alive) and goodbye (off to the
  // shelf): a couple of happy hops with a squash on each landing
  greet(tr) {
    const root = this.bones.root;
    const t = tr.t;
    const hops = tr.name === 'bye' ? 1 : 2;
    const k = Math.min(1, t / (tr.dur * 0.85));
    // (sines squared, so the hops leave and touch the ground at no speed)
    const h = Math.max(0, Math.sin(k * Math.PI * hops)) ** 2;
    root.position.y += h * 0.05 * (this.hopScale ?? 1);
    const sq = Math.max(0, -Math.sin(k * Math.PI * hops + 0.4)) ** 2 * (1 - k);
    root.scale.set(1 + sq * 0.08, 1 - sq * 0.1, 1 + sq * 0.08);
    if (tr.name === 'bye') root.rotation.y += k * k * Math.PI * 2;
    else root.rotation.z += Math.sin(t * 10) * 0.08 * (1 - k);
    if (!tr.fired) {
      tr.fired = true;
      this.emit('sound', { name: 'happy' });
    }
  }

  startTrick(name, dur) {
    this.trick = { name, t: 0, dur };
    this.happy.kick(3);
  }

  // Generic emotes any friend can play, layered on top of whatever its own
  // animation is doing (they only use the bones nearly every friend has:
  // root, chest, neck, head, jaw, ears, tail): hop, cheer, giggle, spin, eat,
  // nuzzle, sniff, bow. Returns false when a trick is running.
  emote(name, dur = EMOTES[name] ?? 1.2) {
    if (this.trick && this.trick.name !== 'hello') return false;
    this.emoteState = { name, t: 0, dur, fired: false };
    this.happy.kick(name === 'cheer' || name === 'giggle' ? 4 : 2);
    return true;
  }

  get emoting() {
    return this.emoteState?.name ?? null;
  }

  playEmote(em, dt) {
    em.t += dt;
    const k = Math.min(1, em.t / em.dur);
    const env = Math.sin(k * Math.PI); // 0 -> 1 -> 0 over the emote
    const B = this.bones;
    const root = B.root;
    const t = em.t;
    const hs = this.hopScale ?? 1;
    const add = (b, x = 0, y = 0, z = 0) => {
      if (b) {
        b.rotation.x += x;
        b.rotation.y += y;
        b.rotation.z += z;
      }
    };
    // a bouncing hop with a squash at each landing: n hops of height h (metres)
    const hop = (n, h) => {
      const ph = k * n;
      // (sines squared: it leaves the ground and comes down to it at no speed, and the squash
      // eases in and out, so a hop has no jolt at take-off or landing)
      const up = Math.max(0, Math.sin(ph * Math.PI)) ** 2;
      root.position.y += up * h * hs;
      const sq = Math.max(0, -Math.sin(ph * Math.PI + 0.35)) ** 2 * (1 - k * 0.6);
      root.scale.multiply(_s.set(1 + sq * 0.09, 1 - sq * 0.11, 1 + sq * 0.09));
    };
    switch (em.name) {
      case 'hop':
        hop(2, 0.05);
        break;
      case 'cheer':
        hop(3, 0.085);
        add(B.chest, -0.12 * env);
        add(B.neck, -0.18 * env);
        add(B.head, -0.1 * env, 0, Math.sin(t * 14) * 0.1 * env);
        add(B.jaw, 0.3 * env);
        root.rotation.z += Math.sin(t * 12) * 0.07 * env;
        break;
      case 'giggle': {
        const w = Math.sin(t * 24) * env;
        root.rotation.z += w * 0.09;
        root.scale.multiply(_s.set(1 + w * 0.03, 1 - w * 0.035, 1 + w * 0.03));
        add(B.head, 0, 0, w * 0.1);
        add(B.jaw, 0.16 * env);
        this.blinker.hold = env > 0.3 ? 0.8 : 0; // a happy squint
        break;
      }
      case 'spin':
        root.rotation.y += easeSpin(k) * Math.PI * 2;
        hop(1, 0.045);
        break;
      case 'eat': {
        // head down to the food, munching, then up with a chew
        const dip = Math.min(1, em.t / 0.35) * (1 - Math.max(0, (k - 0.8) / 0.2));
        add(B.neck, 0.5 * dip);
        add(B.head, 0.35 * dip + Math.sin(t * 16) * 0.05 * dip);
        add(B.jaw, (0.12 + Math.sin(t * 22) * 0.1) * dip);
        root.rotation.x += 0.05 * dip;
        break;
      }
      case 'nuzzle':
        // leaning into a stroking hand, eyes shut with happiness
        root.rotation.z += Math.sin(t * 5) * 0.05 * env;
        add(B.neck, 0.08 * env);
        add(B.head, 0.05 * env, Math.sin(t * 5) * 0.12 * env, -0.16 * env);
        root.scale.multiply(_s.set(1 + 0.02 * env, 1 - 0.03 * env, 1 + 0.02 * env));
        this.blinker.hold = env > 0.25 ? 0.9 : 0;
        break;
      case 'sniff':
        add(B.neck, 0.4 * env);
        add(B.head, 0.3 * env + Math.sin(t * 30) * 0.025 * env, Math.sin(t * 3) * 0.2 * env);
        break;
      case 'bow':
        // a play bow: front down, tail and hindquarters up
        add(B.chest, 0.4 * env);
        add(B.neck, 0.1 * env);
        add(B.hips, -0.22 * env);
        break;
      default:
        break;
    }
    if (!em.fired) {
      em.fired = true;
      this.emit('sound', { name: em.name === 'eat' ? 'munch' : em.name === 'nuzzle' ? 'purr' : em.name === 'giggle' ? 'giggle' : 'happy' });
    }
    if (em.t >= em.dur) {
      this.emoteState = null;
      this.blinker.hold = 0;
    }
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  // the middle of the friend as it is posed now (a flying friend's body is
  // lifted by its root bone), in world space
  worldCenter(out = new THREE.Vector3()) {
    this.bounds.getCenter(out);
    const root = this.bones.root;
    if (root) {
      const rest = this.sculptor.bones[this.sculptor.index.root].pos;
      root.updateWorldMatrix(true, false);
      _w.set(0, 0, 0).applyMatrix4(root.matrixWorld);
      this.object.worldToLocal(_w);
      out.x += _w.x - rest[0];
      out.y += _w.y - rest[1];
      out.z += _w.z - rest[2];
    }
    return this.object.localToWorld(out);
  }

  // a world-space point on a bone (rest-space offset from that bone)
  bonePoint(name, offset = [0, 0, 0], out = new THREE.Vector3()) {
    const b = this.bones[name];
    b.updateWorldMatrix(true, false);
    return out.set(offset[0], offset[1], offset[2]).applyMatrix4(b.matrixWorld);
  }

  // (the materials are left to the garbage collector: disposing one releases
  // its shader program, and the next friend of the same kind would have to
  // compile it all over again)
  dispose() {
    const seen = new Set();
    for (const m of this.meshes) {
      if (!seen.has(m.geometry)) {
        m.geometry.dispose();
        seen.add(m.geometry);
      }
    }
    this.ownSkin?.dispose(); // the skin texture or target it came alive with
    this.skeleton.dispose();
  }
}

export { Z };
