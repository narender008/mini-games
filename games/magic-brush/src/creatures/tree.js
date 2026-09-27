// Sprout, a little tree friend: a chunky trunk with a friendly face (big
// glossy eyes, rosy cheeks, a smile) in smooth bark between ridges of rough
// bark, roots splayed at its foot, and a big billowing canopy of leaves:
// soft leafy puffs covered in translucent leaves that rustle on springs,
// with a few shiny apples. The child's colours become its leaves and bark.
//
// It lives planted in the garden, where it grows up big: it doesn't walk,
// it sways in the breeze, its leaves rustle and it looks about.
//
// Tricks: 'shake' (shakes its canopy so leaves flutter down), 'grow'
// (crouches, stretches up tall and bounces back) and 'sway' (sways to a
// humming tune, eyes closed).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, bindBy, tintBy } from './parts.js';
import { fieldOf, hit, grad, placeAlong, stripUv, mergeAll, mergeSkinned } from './shape-kit.js';
import { bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp, easeOutBack } from './anim.js';
import { glide, puff } from '../sound/calls.js';

const LEAF = 0x4caf50;
const LIME = 0xa5d63a;
const BARK = 0x8a5a36;
const BARK_D = 0x5e3b22;
const MOUTH = 0x3a1c12;
const CHEEK = 0xf08a7a;
const APPLE = 0xe53935;

const EYE_R = 0.019;
// the leafy puffs of the canopy: [centre, radii, bone]
const PUFFS = [
  [[0, 0.29, 0], [0.108, 0.082, 0.094], 'puffC'],
  [[-0.088, 0.25, 0.012], [0.066, 0.058, 0.062], 'puffL'],
  [[0.09, 0.255, 0.006], [0.068, 0.06, 0.062], 'puffR'],
  [[0, 0.35, -0.004], [0.072, 0.056, 0.066], 'puffT'],
  [[0.048, 0.33, 0.035], [0.05, 0.045, 0.048], 'puffT'],
  [[-0.052, 0.325, 0.03], [0.05, 0.044, 0.048], 'puffT'],
  [[0, 0.265, -0.07], [0.08, 0.06, 0.05], 'puffC'],
];

export class Tree extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { sheen: 0.5, clearcoat: 0.15 };
    // a big friend, shown big: a slightly coarser mesh is plenty
    this.voxelScale = 1.3;
    this.shared.uSplat.value = 0.25;
    this.walkSpeed = 0;
    this.turnRate = 1;
    this.worldScale = 2.6;
    this.hopScale = 0.6;
    this.sparkleColors = [[1.3, 2.0, 0.8], [1.9, 1.8, 0.8], [1.9, 1.1, 1.0]];
    this.sway = new Spring(0, 1.1, 0.35);
    this.rustle = ['puffC', 'puffL', 'puffR', 'puffT'].map(() => [new Spring(0, 2.8, 0.2), new Spring(0, 2.8, 0.2)]);
    this.popped = [false, false, false, false];
    this.headYaw = new Spring(0, 1.2, 0.7);
    this.squash = new Spring(0, 2.4, 0.25);
    this.grow = 9;
    this.gustIn = 1.5;
  }

  get tricks() {
    return ['shake', 'grow', 'sway'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0, 0]);
    s.bone('trunk', 'root', [0, 0.02, 0]);
    s.bone('face', 'trunk', [0, 0.11, 0]);
    s.bone('crown', 'trunk', [0, 0.19, 0]);
    s.bone('puffC', 'crown', [0, 0.26, 0]);
    s.bone('puffL', 'crown', [-0.07, 0.24, 0.01]);
    s.bone('puffR', 'crown', [0.07, 0.245, 0.005]);
    s.bone('puffT', 'puffC', [0, 0.32, 0]);

    // the face, found on the trunk
    const FT = fieldOf([{ type: 0, c: [0, 0.118, 0.012], r: [0.047, 0.05, 0.042], k: 0.001, m: null, sub: false }]);
    const pe = hit(FT, [0.021, 0.128, 0], [0.3, 0.02, 1]);
    const ne = grad(FT, pe);
    this.eyeC = [pe[0] - ne[0] * EYE_R * 0.42, pe[1] - ne[1] * EYE_R * 0.42, pe[2] - ne[2] * EYE_R * 0.42];
    this.eyeBones(s, this.eyeC, 'face');

    const bark = { tint: BARK, paint: 1, rough: 0.75, pat: 0, fur: 0 };
    s.setLook(bark);
    // the trunk: chunky, flaring at the foot, a smooth round face
    s.cone([0, 0.0, 0], [0, 0.205, 0], 0.058, 0.045, { bone: 'trunk', k: 0.001 });
    s.ellipsoid([0, 0.118, 0.012], [0.047, 0.05, 0.042], { bone: 'face', k: 0.02, rough: 0.6 });
    // roots splaying out
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      s.cone([Math.sin(a) * 0.02, 0.035, Math.cos(a) * 0.02], [Math.sin(a) * 0.085, 0.006, Math.cos(a) * 0.085], 0.024, 0.008, { bone: 'root', k: 0.022 });
    }
    // flat underneath
    s.box([0, -0.1, 0], [0.3, 0.1, 0.3], 0, { bone: 'root', sub: true, k: 0.003 });
    // two little branches up into the canopy
    s.cone([0.02, 0.18, 0], [0.07, 0.235, 0.004], 0.014, 0.008, { bone: 'crown', k: 0.014 });
    s.cone([-0.02, 0.185, 0], [-0.068, 0.232, 0.008], 0.014, 0.008, { bone: 'crown', k: 0.014 });
    // the canopy: leafy puffs
    const leafy = { tint: 0x2e7d32, paint: 0.85, rough: 0.8, pat: 0 };
    for (const [c, r, bone] of PUFFS) s.ellipsoid(c, r, { bone, k: 0.02, ...leafy });
    // rosy cheeks and the smile
    const FF = fieldOf([{ type: 0, c: [0, 0.118, 0.012], r: [0.047, 0.05, 0.042], k: 0.001, m: null, sub: false }]);
    const pc = hit(FF, [0.03, 0.1, 0.0], [0.5, 0, 1]);
    const nc = grad(FF, pc);
    s.sphere([pc[0] - nc[0] * 0.007, pc[1] - nc[1] * 0.007, pc[2] - nc[2] * 0.007], 0.0095, { bone: 'face', k: 0.003, sym: true, tint: CHEEK, paint: 0.3, rough: 0.5 });
    this.smile = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const p = hit(FF, [u * 0.018, 0.098 + 0.008 * u * u, 0], [0, 0, 1]);
      this.smile.push([p[0], p[1], p[2] + 0.0018]);
    }
    s.chain(this.smile, this.smile.map((_, i) => {
      const u = (i / (n - 1)) * 2 - 1;
      return 0.0017 + 0.003 * (1 - u * u);
    }), { bone: 'face', sub: true, k: 0.0018, tint: MOUTH, paint: 0, rough: 0.6 });
  }

  parts(s) {
    const I = s.index;
    const F = fieldOf(s.prims);
    const q = this.q.tier === 'low' ? 0.6 : this.q.tier === 'medium' ? 0.8 : 1;
    this.addEyes(s, {
      c: this.eyeC,
      r: EYE_R,
      dir: [0.28, 0.04, 1],
      bone: 'face',
      iris: 0x3f9a4a,
      iris2: 0x1d4d25,
      irisSize: 0.76,
      pupil: 0.45,
      lid: { tint: BARK, paint: 1, rough: 0.6, open: -0.7, closed: 1.55 },
    });

    // ---- ridges of rough bark up the trunk, round the back and sides
    {
      const ridges = [];
      const M = 15;
      for (let k = 0; k < M; k++) {
        const a0 = (k / M) * TAU + 0.2;
        const front = Math.cos(a0);
        if (front > 0.72) continue; // leave the face smooth
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const y = 0.022 + (i / 14) * 0.17;
          const a = a0 + Math.sin(y * 55 + k) * 0.08;
          const p = hit(F, [0, y, 0], [Math.sin(a), 0, Math.cos(a)], 0.2);
          const nn = grad(F, p);
          pts.push([p[0] + nn[0] * 0.0006, p[1], p[2] + nn[2] * 0.0006]);
        }
        const r = 0.0048 + (k % 3) * 0.0008;
        ridges.push(tubeGeometry(pts, [r * 0.5, r, r, r * 0.8, r * 0.4], { radial: 7, steps: Math.round(28 * q) }));
      }
      const g = mergeAll(ridges.map(stripUv));
      withLook(g, { tint: BARK_D, paint: 0.85, rough: 0.9 });
      bindBy(g, (x, y) => [[y > 0.105 ? I.face : I.trunk, 1]]);
      this.addMesh(g, this.hide, { shadow: true });
    }

    // ---- leaves all over the canopy, and apples
    {
      const leaves = [];
      const apples = [];
      const rnd = mulberry(7);
      const count = Math.round(620 * q);
      const boneOf = (p) => {
        let best = 'puffC';
        let bd = 1e9;
        for (const [c, , bone] of PUFFS) {
          const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
          if (d < bd) {
            bd = d;
            best = bone;
          }
        }
        return I[best];
      };
      const light = new THREE.Color(LIME);
      const dark = new THREE.Color(0x2e7d32);
      for (let i = 0; i < count; i++) {
        // a direction over the canopy, fewer underneath
        const u = rnd() * 2 - 1;
        const phi = rnd() * TAU;
        const r = Math.sqrt(1 - u * u);
        const dir = [r * Math.cos(phi), u * 0.8 + 0.25, r * Math.sin(phi)];
        const p = hit(F, [0, 0.29, 0], dir, 0.3);
        if (p[1] < 0.2) continue;
        const nn = grad(F, p);
        const g = leafCard(0.019 + rnd() * 0.009, 0.011 + rnd() * 0.004);
        // tilt it off the surface a little, spin it round the normal
        const tilt = new THREE.Vector3(nn[0] + (rnd() - 0.5) * 0.5, nn[1] + (rnd() - 0.5) * 0.5 + 0.35, nn[2] + (rnd() - 0.5) * 0.5).normalize();
        g.rotateZ(rnd() * TAU);
        placeAlong(g, p, tilt.toArray(), 0.001 + rnd() * 0.006);
        withLook(g, { tint: LEAF, paint: 0.7, rough: 0.55 });
        const c = dark.clone().lerp(new THREE.Color(LEAF), 0.4 + rnd() * 0.4).lerp(light, rnd() * rnd());
        tintBy(g, (x, y, z, col) => col.copy(c));
        leaves.push(bindTo(g, boneOf(p)));
      }
      const lm = this.mat('membrane', { veins: 5, iridescence: 0.05 });
      lm.sheen = 0.6;
      this.addMesh(mergeSkinned(leaves), lm, { shadow: true }).userData.region = 1; // drawn as one with the canopy
      // a few shiny apples
      for (const [dx, dy] of [[0.07, 0.24], [-0.06, 0.23], [0.035, 0.33], [-0.09, 0.29], [0.1, 0.3]]) {
        const p = hit(F, [dx * 0.5, dy, 0], [dx, (dy - 0.27) * 0.5, 1], 0.3);
        const nn = grad(F, p);
        const g = new THREE.SphereGeometry(0.0105, Math.round(20 * q), 14);
        g.scale(1, 0.92, 1);
        const pos = g.attributes.position;
        // a dimple on top where the stalk goes in
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const rr = Math.hypot(pos.getX(i), pos.getZ(i));
          if (y > 0) pos.setY(i, y - Math.exp(-rr * rr / 0.00002) * 0.003);
        }
        g.computeVertexNormals();
        g.translate(p[0] + nn[0] * 0.007, p[1] + nn[1] * 0.007, p[2] + nn[2] * 0.007);
        withLook(stripUv(g), { tint: APPLE, rough: 0.25 });
        const top = p[1] + nn[1] * 0.007 + 0.009;
        tintBy(g, (x, y, z, col) => col.setHex(APPLE).lerp(new THREE.Color(0xffc93c), smooth((y - top + 0.02) / 0.02) * 0.35));
        apples.push(bindTo(g, boneOf(p)));
        const stalk = tubeGeometry([[p[0] + nn[0] * 0.007, top - 0.003, p[2] + nn[2] * 0.007], [p[0] + nn[0] * 0.007 + 0.001, top + 0.004, p[2] + nn[2] * 0.007]], [0.0011, 0.0009], { radial: 6, steps: 3 });
        withLook(stripUv(stalk), { tint: 0x5e3b22, rough: 0.7 });
        apples.push(bindTo(stalk, boneOf(p)));
      }
      this.addMesh(mergeSkinned(apples), this.mat('solid', { clearcoat: 1 }), { shadow: true }).userData.region = 40;
    }
  }

  // popped up in the garden: grow up out of the ground
  onArrive() {
    this.grow = 0;
    this.grewSound = false;
  }

  // ------------------------------------------------------------ motion

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const air = this.motion.air;
    this.blinker.hold = 0;

    // the breeze, with a gust now and then that sets the leaves rustling
    this.gustIn -= dt;
    if (this.gustIn <= 0) {
      this.gustIn = 1.5 + Math.random() * 3.5;
      const g = (Math.random() - 0.5) * 1.4;
      this.sway.kick(g);
      for (const [a, b] of this.rustle) {
        a.kick((Math.random() - 0.5) * 3);
        b.kick((Math.random() - 0.5) * 3);
      }
    }
    if (this.trick && (this.trick.name === 'hello' || this.trick.name === 'bye')) {
      const k = Math.cos(this.trick.t * 7) * dt * 14;
      for (let i = 0; i < 4; i++) this.rustle[i][0].kick(k);
      this.squash.kick(k * 0.1);
    }
    const sw = this.sway.update(0, dt);
    const wind = Math.sin(t * 0.9) * 0.02 + Math.sin(t * 1.7 + 1) * 0.008;
    const breathe = Math.sin(t * 1.8);
    const sq = this.squash.update(0, dt);
    B.trunk.rotation.z = (wind + sw * 0.05) * 0.5;
    B.trunk.rotation.x = Math.sin(t * 0.7) * 0.01 - air * 0.1;
    B.trunk.scale.set(1 - sq * 0.4 + breathe * 0.004, 1 + sq + breathe * 0.006, 1 - sq * 0.4 + breathe * 0.004);
    B.crown.rotation.z = wind + sw * 0.08;
    B.crown.rotation.x = Math.sin(t * 0.6 + 0.4) * 0.015 + air * 0.15;
    for (let i = 0; i < 4; i++) {
      const b = B[PUFF_NAMES[i]];
      const ra = this.rustle[i][0].update(0, dt);
      const rb = this.rustle[i][1].update(0, dt);
      const flick = Math.sin(t * (6.5 + i) + i * 2) * 0.006 * (0.6 + Math.abs(sw));
      b.rotation.set(ra * 0.05 + flick, 0, rb * 0.05 + flick * 0.7);
      b.scale.setScalar(1 + breathe * 0.008 + ra * 0.01);
    }

    // growing up out of the ground, just arrived: the puffs pop out in turn
    if (this.grow < 2.5) {
      this.grow += dt;
      const g = clamp(this.grow / 1.6, 0, 1);
      B.root.scale.set(lerp(0.7, 1, easeOutBack(g, 1.6)), lerp(0.35, 1, easeOutBack(g, 2.4)), lerp(0.7, 1, easeOutBack(g, 1.6)));
      // its song waits for the come-alive shimmer to pass
      if (this.grow > 0.6 && !this.grewSound) {
        this.grewSound = true;
        this.emit('sound', { name: 'grow' });
      }
      for (let i = 0; i < 4; i++) {
        const name = PUFF_NAMES[i];
        const k = clamp((this.grow - 0.3 - i * 0.18) / 0.5, 0, 1);
        B[name].scale.multiplyScalar(Math.max(0.05, easeOutBack(k, 2.6)));
        if (k > 0 && !this.popped[i]) {
          this.popped[i] = true;
          this.emit('sparkle', { at: this.restPoint(name, PUFFS[i][0]), count: 12, colors: LEAFY, speed: 0.5, up: 0.6, size: 0.02 });
        }
      }
      if (this.grow >= 2.5) this.popped.fill(false);
    }

    // the face looks about
    let yawT = Math.sin(t * 0.27) * 0.3 + Math.sin(t * 0.11) * 0.2;
    if (this.lookLocal) yawT = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z), -0.8, 0.8);
    const hy = this.headYaw.update(yawT, dt);
    B.face.rotation.set(Math.sin(t * 0.33) * 0.03, hy * 0.25, -B.trunk.rotation.z * 0.5);

    if (this.trick) this.trickPose(this.trick, dt);
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'shake') {
      // squat, then a vigorous shake: leaves flutter down
      const pre = ramp(t, 0, 0.3) * (1 - ramp(t, 0.3, 0.42));
      B.trunk.scale.y *= 1 - pre * 0.06;
      const sh = bump(t, 0.35, 1.7) * (0.5 + 0.5 * Math.sin(Math.min(1, (t - 0.35) / 0.3) * Math.PI * 0.5));
      B.crown.rotation.z += Math.sin(t * 34) * 0.1 * sh;
      B.trunk.rotation.z += Math.sin(t * 34 + 0.6) * 0.03 * sh;
      for (let i = 0; i < 4; i++) {
        this.rustle[i][0].kick(Math.sin(t * 40) * dt * 30 * sh);
        this.rustle[i][1].kick(Math.cos(t * 37) * dt * 30 * sh);
      }
      this.blinker.hold = Math.max(pre * 0.6, sh * 0.85);
      if (!tr.a && t > 0.35) {
        tr.a = true;
        this.emit('sound', { name: 'rustle' });
      }
      tr.drop = (tr.drop ?? 0) + dt * sh * 4;
      while (tr.drop > 1) {
        tr.drop -= 1;
        const x = (Math.random() - 0.5) * 0.18;
        _p[0] = x;
        _p[1] = 0.22 + Math.random() * 0.1;
        _p[2] = 0.05 + Math.random() * 0.04;
        _q[0] = x * 2;
        const at = this.restPoint('crown', _p, _a);
        const to = this.restPoint('crown', _q, _b);
        this.emit('puff', { at, dir: to, count: 11, speed: 0.25, push: 0.35, size: 0.024, colors: FALLING });
      }
      if (!tr.b && t > 1.75) {
        tr.b = true;
        this.sway.kick(1);
        this.emit('sound', { name: 'happy' });
      }
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 1.8, 2.35) * 0.5);
      return;
    }
    if (tr.name === 'grow') {
      // crouch, stretch up tall with the canopy puffing out, bounce back
      const crouch = ramp(t, 0, 0.35) * (1 - ramp(t, 0.35, 0.5));
      const up = ramp(t, 0.4, 0.75) * (1 - ramp(t, 1.5, 1.75));
      const k = crouch * -0.1 + up * 0.22;
      B.root.scale.set(1 - k * 0.35, 1 + k, 1 - k * 0.35);
      for (let i = 0; i < 4; i++) B[PUFF_NAMES[i]].scale.multiplyScalar(1 + up * 0.12);
      this.blinker.hold = crouch * 0.7 + up * -0.2;
      if (!tr.a && t > 0.4) {
        tr.a = true;
        this.emit('sound', { name: 'stretch' });
        this.emit('sparkle', { at: this.restPoint('puffT', [0, 0.4, 0.02]), count: 24, speed: 0.6, up: 1.0, size: 0.02 });
      }
      if (!tr.b && t > 1.7) {
        tr.b = true;
        this.squash.kick(-0.9);
        for (const [a, b] of this.rustle) {
          a.kick(4);
          b.kick(-3);
        }
        this.emit('sound', { name: 'boing' });
        this.emit('land', { at: this.restPoint('root', [0, 0, 0.05]) });
      }
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 1.8, 2.5) * 0.5);
      return;
    }
    if (tr.name === 'sway') {
      // a slow dance in the wind to a wooden tune
      const env = ramp(t, 0, 0.4) * (1 - ramp(t, 2.3, 2.8));
      const beat = t * TAU * 0.8;
      B.trunk.rotation.z += Math.sin(beat) * 0.08 * env;
      B.crown.rotation.z += Math.sin(beat - 0.8) * 0.14 * env;
      B.face.rotation.z -= Math.sin(beat - 0.3) * 0.05 * env;
      for (let i = 0; i < 4; i++) this.rustle[i][0].kick(Math.cos(beat) * dt * 3 * env);
      this.blinker.hold = env * 0.95;
      if (!tr.a && t > 0.05) {
        tr.a = true;
        this.emit('sound', { name: 'tune' });
      }
      if (!tr.b && t > 1.3) {
        tr.b = true;
        this.emit('sparkle', { at: this.restPoint('puffC', [0, 0.36, 0.06]), count: 14, speed: 0.4, up: 0.6, size: 0.018 });
      }
      if (!tr.c && t > 2.4) {
        tr.c = true;
        this.emit('sound', { name: 'happy' });
      }
    }
  }

  trickLength(name) {
    return { shake: 2.4, grow: 2.6, sway: 2.8 }[name] || 2;
  }

  restPoint(bone, p, out) {
    const b = this.sculptor.bones[this.sculptor.index[bone]].pos;
    _r[0] = p[0] - b[0];
    _r[1] = p[1] - b[1];
    _r[2] = p[2] - b[2];
    return this.bonePoint(bone, _r, out);
  }
}

const PUFF_NAMES = ['puffC', 'puffL', 'puffR', 'puffT'];
const LEAFY = [[1.3, 2.0, 0.8], [1.9, 1.8, 0.8]];
const FALLING = [[0.9, 1.9, 0.5], [1.6, 1.9, 0.5], [1.9, 1.5, 0.4]];
const _p = [0, 0, 0];
const _q = [0, 0.0, 0.2];
const _r = [0, 0, 0];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export const calls = {
  // a happy little wooden tune: tok-tok-ting
  happy(a, t) {
    marimba(a, t, 587, 0.07);
    marimba(a, t + 0.12, 784, 0.07);
    a.bell(1568, 0.02, t + 0.26, 0.7);
  },
  // leaves rustling
  rustle(a, t) {
    for (let i = 0; i < 6; i++) puff(a, t + i * 0.18, { v: 0.15 - i * 0.012, from: 2500, to: 4200, dur: 0.22 });
  },
  // stretching up tall: a climbing run of wooden notes and a sparkle
  stretch(a, t) {
    for (const [i, f] of [262, 330, 392, 523].entries()) marimba(a, t + i * 0.09, f, 0.06);
    for (const [i, f] of [1047, 1319, 1568].entries()) a.bell(f, 0.018, t + 0.4 + i * 0.08, 0.7);
  },
  // a bouncy spring: boi-oi-oing
  boing(a, t) {
    glide(a, t, [[0, 147], [0.07, 262], [0.35, 131]], { type: 'sine', v: 0.1, formant: 450, q: 0.8, trill: 16, trillDepth: 0.5 });
    puff(a, t, { v: 0.04, from: 300, to: 600, dur: 0.25 });
  },
  // a slow tune on a wooden marimba to sway to
  tune(a, t) {
    for (const [i, f] of [523, 659, 784, 659, 587].entries()) {
      marimba(a, t + i * 0.42, f, 0.06, 0.7);
      marimba(a, t + i * 0.42 + 0.21, f / 2, 0.035, 0.5);
    }
  },
  // growing up out of the ground: a rustle and a climb of wooden notes
  grow(a, t) {
    puff(a, t, { v: 0.03, from: 800, to: 2400, dur: 0.8 });
    for (const [i, f] of [196, 262, 330, 392, 523].entries()) marimba(a, t + 0.05 + i * 0.13, f, 0.05);
    a.bell(1568, 0.018, t + 0.75, 0.8);
  },
};

// a wooden marimba bar: a warm note that dies away fast, with the bar's
// bright overtone two octaves up
function marimba(a, t, f, v, dur = 0.5) {
  const ctx = a.ctx;
  for (const [m, k, d] of MARIMBA) {
    const o = ctx.createOscillator();
    o.frequency.value = f * m;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * k, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * d);
    o.connect(g).connect(a.sfx);
    o.start(t);
    o.stop(t + dur * d + 0.05);
  }
}
const MARIMBA = [[1, 1, 1], [3.93, 0.25, 0.22], [9.2, 0.06, 0.08]];

// ------------------------------------------------------------ geometry

// a small leaf card: a pointed oval in the xy-plane, facing +z, a little
// folded along its midrib
function leafCard(len, wid) {
  const pos = [];
  const idx = [];
  const nu = 5;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const w = (wid / 2) * Math.pow(Math.sin(Math.PI * u), 0.8);
    const y = (u - 0.35) * len;
    pos.push(-w, y, -w * 0.25, 0, y, 0, w, y, -w * 0.25);
  }
  for (let i = 0; i < nu; i++) {
    const a = i * 3;
    idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a small seeded random number generator
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
