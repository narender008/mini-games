// Bloom, a flower friend: a round, smiling face in the middle of the bloom
// (a soft disk of tiny florets, big glossy eyes, rosy cheeks), two rows of
// translucent, velvety petals that glow when the sun is behind them, a
// springy stem with two leaves it uses like arms, and a rosette of leaves
// at its foot. The child's colours become its petals, face and leaves.
//
// It lives planted in a flower bed: it doesn't walk, it sways in the breeze,
// looks about, and its petals breathe and flutter. When it pops up in the
// garden it grows from a bud and bursts open.
//
// Tricks: 'bloom' (closes into a bud, wiggles, then bursts open in a puff of
// pollen), 'dance' (sways to a little tune, waving its leaves) and 'sun'
// (stretches up tall and turns its face to the sun, petals wide).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { withLook, bindTo, tintBy } from './parts.js';
import { fieldOf, hit, grad, stripUv, mergeSkinned } from './shape-kit.js';
import { bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp, easeOutBack } from './anim.js';
import { glide, puff } from '../sound/calls.js';

const PETAL = 0xf25a8e;
const DISK = 0xffd23f;
const GREEN = 0x4caf50;
const DEEP = 0x2e7d32;
const MOUTH = 0x5a2a1a;
const CHEEK = 0xff8fa8;

const HC = [0, 0.228, 0]; // the middle of the bloom
const DISK_R = [0.046, 0.046, 0.025];
const EYE_R = 0.0172;
const N = 9; // petals in each row
const R0 = 0.038; // where the petals start

export class Flower extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { sheen: 0.6, clearcoat: 0.25, scales: true };
    this.shared.uScale.value = 0.0019;
    this.shared.uSplat.value = 0.25;
    this.walkSpeed = 0;
    this.turnRate = 1.2;
    this.worldScale = 1.4;
    this.hopScale = 0.8;
    this.sparkleColors = [[2.0, 1.7, 0.6], [1.9, 1.1, 1.5], [1.6, 1.9, 1.0]];
    this.sway = [0, 1, 2].map((i) => new Spring(0, 1.5 - i * 0.15, 0.3));
    this.headYaw = new Spring(0, 1.4, 0.7);
    this.headPitch = new Spring(0, 1.4, 0.7);
    this.bob = new Spring(0, 2.6, 0.25);
    this.leafS = [new Spring(0, 2.8, 0.2), new Spring(0, 2.6, 0.2)];
    this.open = new Spring(1, 2.2, 0.45);
    this.grow = 9;
    this.gustIn = 2;
  }

  get tricks() {
    return ['bloom', 'dance', 'sun'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0, 0]);
    s.bone('stem0', 'root', [0, 0.004, 0]);
    s.bone('stem1', 'stem0', [0, 0.07, 0]);
    s.bone('stem2', 'stem1', [0, 0.135, 0]);
    s.bone('head', 'stem2', [0, 0.2, 0]);
    s.bone('leafL', 'stem1', [0.005, 0.082, 0.002]);
    s.bone('leafR', 'stem1', [-0.005, 0.112, 0.002]);
    this.petalDirs = [];
    for (let i = 0; i < N; i++) {
      const th = Math.PI / 2 + (i / N) * TAU;
      this.petalDirs.push(th);
      s.bone('petal' + i, 'head', [HC[0] + Math.cos(th) * R0, HC[1] + Math.sin(th) * R0, HC[2] - 0.002]);
    }

    // the face on the disk
    const DC = [HC[0], HC[1], HC[2] + 0.006];
    const FD = fieldOf([{ type: 0, c: DC, r: DISK_R, k: 0.001, m: null, sub: false }]);
    const pe = hit(FD, [0.0185, HC[1] + 0.009, 0], [0.16, 0.05, 1]);
    const ne = grad(FD, pe);
    this.eyeC = [pe[0] - ne[0] * EYE_R * 0.4, pe[1] - ne[1] * EYE_R * 0.4, pe[2] - ne[2] * EYE_R * 0.4];
    this.eyeBones(s, this.eyeC, 'head');

    const stem = { tint: GREEN, paint: 1, rough: 0.5, pat: 0, fur: 0 };
    s.setLook(stem);
    // the stem, in three springy pieces
    s.cone([0, 0.0, 0], [0, 0.07, 0.002], 0.0088, 0.008, { bone: 'stem0', k: 0.001 });
    s.cone([0, 0.07, 0.002], [0, 0.135, 0.001], 0.008, 0.0072, { bone: 'stem1', k: 0.012 });
    s.cone([0, 0.135, 0.001], [0, 0.2, -0.004], 0.0072, 0.0066, { bone: 'stem2', k: 0.012 });
    // a little knot where each leaf grows
    s.sphere([0.0035, 0.082, 0.002], 0.0078, { bone: 'stem1', k: 0.008 });
    s.sphere([-0.0035, 0.112, 0.002], 0.0072, { bone: 'stem1', k: 0.008 });
    // the calyx cupping the back of the bloom
    s.cone([0, 0.198, -0.004], [0, 0.22, -0.012], 0.0066, 0.012, { bone: 'head', k: 0.01, tint: DEEP });
    s.ellipsoid([0, 0.226, -0.014], [0.032, 0.032, 0.017], { bone: 'head', k: 0.012, tint: DEEP });
    // the face: a soft disk of florets
    s.ellipsoid(DC, DISK_R, { bone: 'head', k: 0.008, tint: DISK, paint: 1, rough: 0.55, pat: 0.8 });
    // smooth round the eyes, rosy cheeks
    s.sphere(this.eyeC, EYE_R * 0.8, { bone: 'head', k: 0.004, sym: true, tint: DISK, pat: 0 });
    const pc = hit(FD, [0.029, HC[1] - 0.01, 0], [0.3, 0, 1]);
    const nc = grad(FD, pc);
    s.sphere([pc[0] - nc[0] * 0.006, pc[1] - nc[1] * 0.006, pc[2] - nc[2] * 0.006], 0.0085, { bone: 'head', k: 0.003, sym: true, tint: CHEEK, paint: 0.3, pat: 0, rough: 0.5 });
    // the smile
    this.smile = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const p = hit(FD, [u * 0.0175, HC[1] - 0.0145 + 0.0085 * u * u, 0], [0, 0, 1]);
      this.smile.push([p[0], p[1], p[2] + 0.0015]);
    }
    s.chain(this.smile, this.smile.map((_, i) => {
      const u = (i / (n - 1)) * 2 - 1;
      return 0.0015 + 0.0028 * (1 - u * u);
    }), { bone: 'head', sub: true, k: 0.0016, tint: MOUTH, paint: 0, pat: 0, rough: 0.6 });
  }

  parts(s) {
    const I = s.index;
    const q = this.q.tier === 'low' ? 0.6 : this.q.tier === 'medium' ? 0.8 : 1;
    this.addEyes(s, {
      c: this.eyeC,
      r: EYE_R,
      dir: [0.2, 0.05, 1],
      bone: 'head',
      iris: 0x5a3fbf,
      iris2: 0x2a1f70,
      irisSize: 0.76,
      pupil: 0.45,
      lid: { tint: DISK, paint: 1, rough: 0.55, open: -0.7, closed: 1.55 },
    });

    // ---- petals: a back row (longer, darker) and a front row between them
    const petals = [];
    for (let i = 0; i < N; i++) {
      const bone = I['petal' + i];
      const th = this.petalDirs[i];
      petals.push(bindTo(petalGeometry(HC, th + Math.PI / N, R0 - 0.004, 0.064, 0.034, { z: -0.0055, fwd: 0.004, curl: 0.01, shade: 0.82, q }), bone));
      petals.push(bindTo(petalGeometry(HC, th, R0 - 0.001, 0.057, 0.031, { z: -0.0012, fwd: 0.009, curl: 0.008, shade: 1, q }), bone));
    }
    const pm = this.mat('membrane', { veins: 9, iridescence: 0.15 });
    pm.sheen = 0.9;
    pm.sheenRoughness = 0.45;
    this.addMesh(mergeSkinned(petals), pm, { shadow: true }).userData.region = 40;

    // ---- leaves: two on the stem (its arms) and a rosette at its foot
    const leaves = [];
    leaves.push(bindTo(leafGeometry([0.006, 0.082, 0.003], [0.9, 0.42, 0.12], [0, 0, 1], 0.062, 0.026, { droop: 0.012, q }), I.leafL));
    leaves.push(bindTo(leafGeometry([-0.006, 0.112, 0.003], [-0.9, 0.46, 0.1], [0, 0, 1], 0.056, 0.024, { droop: 0.011, q }), I.leafR));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.35;
      const d = [Math.sin(a), 0.42, Math.cos(a)];
      leaves.push(bindTo(leafGeometry([Math.sin(a) * 0.004, 0.004, Math.cos(a) * 0.004], d, [0, 1, 0], 0.04, 0.02, { droop: 0.008, q }), I.root));
    }
    const lm = this.mat('membrane', { veins: 7, iridescence: 0.05 });
    lm.sheen = 0.5;
    this.addMesh(mergeSkinned(leaves), lm, { shadow: true }).userData.region = 41;
  }

  // popped up in the garden: grow from a bud and burst open
  onArrive() {
    this.grow = 0;
    this.grewOpen = false;
    this.grewSound = false;
    this.open.x = 0;
    this.open.v = 0;
  }

  // ------------------------------------------------------------ motion

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const air = this.motion.air;
    this.blinker.hold = 0;

    // the breeze: slow sways with a gust now and then
    this.gustIn -= dt;
    if (this.gustIn <= 0) {
      this.gustIn = 2 + Math.random() * 4;
      const g = (Math.random() - 0.5) * 1.2;
      for (let i = 0; i < 3; i++) this.sway[i].kick(g * (0.6 + i * 0.3));
      this.leafS[0].kick(g * 3);
      this.leafS[1].kick(-g * 3);
    }
    let lean = 0;
    for (let i = 0; i < 3; i++) {
      const b = B[STEMS[i]];
      const s = this.sway[i].update(0, dt);
      const wind = Math.sin(t * 1.1 - i * 0.45) * 0.035 + Math.sin(t * 2.3 + i) * 0.012;
      b.rotation.z = (wind + s * 0.08) * (0.6 + i * 0.3);
      b.rotation.x = Math.sin(t * 0.83 + i * 0.6) * 0.02 - air * 0.12 * (i === 0 ? 1 : 0.5);
      lean += b.rotation.z;
    }

    // growing up out of the ground, just arrived
    if (this.grow < 2) {
      this.grow += dt;
      const g = clamp(this.grow / 1.2, 0, 1);
      const st = easeOutBack(g, 2.2);
      B.root.scale.set(lerp(0.9, 1, g), lerp(0.55, 1, st), lerp(0.9, 1, g));
      if (this.grow > 0.45 && !this.grewSound) {
        this.grewSound = true;
        this.emit('sound', { name: 'grow' });
      }
      if (this.grow > 0.55 && !this.grewOpen) {
        this.grewOpen = true;
        this.open.kick(9);
        this.emit('sparkle', { at: this.restPoint('head', [0, HC[1], 0.03]), count: 30, colors: [[2.0, 1.7, 0.6], [1.9, 1.1, 1.5]], speed: 0.6, up: 0.7, size: 0.018 });
      }
    }

    // the head looks about, bobbing on its stem
    let yawT = Math.sin(t * 0.3) * 0.35 + Math.sin(t * 0.12) * 0.2;
    let pitchT = Math.sin(t * 0.25) * 0.1;
    if (this.lookLocal) {
      yawT = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z), -0.9, 0.9);
      pitchT = clamp(-(this.lookLocal.y - HC[1]) * 0.7, -0.35, 0.35);
    }
    const hy = this.headYaw.update(yawT, dt);
    const hp = this.headPitch.update(pitchT, dt);
    const bob = this.bob.update(0, dt);
    if (this.trick && (this.trick.name === 'hello' || this.trick.name === 'bye')) this.bob.kick(Math.cos(this.trick.t * 7) * dt * 6);
    B.head.rotation.set(hp * 0.6 + bob * 0.3 + air * 0.25, hy * 0.6, -lean * 0.7 + Math.sin(t * 0.45) * 0.05);

    // leaves flutter on their springs
    const l0 = this.leafS[0].update(0, dt);
    const l1 = this.leafS[1].update(0, dt);
    B.leafL.rotation.set(Math.sin(t * 2.9) * 0.03, 0, l0 * 0.25 + Math.sin(t * 1.7) * 0.05 + air * 0.5);
    B.leafR.rotation.set(Math.sin(t * 2.6 + 1) * 0.03, 0, -l1 * 0.25 - Math.sin(t * 1.9 + 0.5) * 0.05 - air * 0.5);

    // how open the bloom is: 1 open, 0 a closed bud, more: spread wide
    let openT = 1 + Math.sin(t * 1.3) * 0.03 + air * 0.25;
    // just arrived: a closed bud until it bursts open
    if (this.grow < 0.55) openT = 0.02;
    if (this.trick) openT = this.trickPose(this.trick, dt) ?? openT;
    const open = this.open.update(openT, dt);
    this.poseP(open, t);
  }

  // fold each petal about the line where it meets the disk
  poseP(open, t) {
    for (let i = 0; i < N; i++) {
      const th = this.petalDirs[i];
      const b = this.bones[PETALS[i]];
      const flutter = Math.sin(t * 3.1 + i * 1.7) * 0.03 + Math.sin(t * 5.3 + i * 2.3) * 0.015;
      const fold = (1 - open) * 1.95 + flutter * (0.4 + 0.6 * clamp(open, 0, 1));
      _axis.set(-Math.sin(th), Math.cos(th), 0);
      b.quaternion.setFromAxisAngle(_axis, -fold);
    }
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'bloom') {
      // close up into a bud, wiggle, then burst open with a puff of pollen
      this.blinker.hold = ramp(t, 0.2, 0.5) * (1 - ramp(t, 1.0, 1.15));
      B.head.rotation.z += Math.sin(t * 22) * 0.07 * bump(t, 0.55, 1.05);
      B.head.scale.setScalar(1 - bump(t, 0.3, 1.05) * 0.06);
      if (!tr.a && t > 0.02) {
        tr.a = true;
        this.emit('sound', { name: 'shut' });
      }
      if (!tr.b && t > 1.05) {
        tr.b = true;
        this.open.kick(12);
        this.bob.kick(-3);
        this.emit('sound', { name: 'bloom' });
        this.emit('puff', { at: this.restPoint('head', [0, HC[1], 0.03]), dir: this.restPoint('head', [0, HC[1] + 0.3, 0.12]), count: 40, speed: 0.5, push: 0.6, size: 0.016, colors: [[2.2, 1.8, 0.5], [2.0, 1.5, 0.4], [2.2, 2.0, 1.0]] });
      }
      if (!tr.c && t > 1.7) {
        tr.c = true;
        this.emit('sound', { name: 'happy' });
      }
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 1.5, 2.4) * 0.55);
      if (t < 1.05) return lerp(1, 0.02, smooth(clamp(t / 0.55, 0, 1)));
      return 1 + bump(t, 1.05, 2.2) * 0.2;
    }
    if (tr.name === 'dance') {
      // sway to the tune, waving the leaves in turn
      const env = ramp(t, 0, 0.3) * (1 - ramp(t, 2.3, 2.8));
      const beat = t * TAU * 1.25;
      for (let i = 0; i < 3; i++) B[STEMS[i]].rotation.z += Math.sin(beat - i * 0.5) * 0.14 * env * (0.6 + i * 0.3);
      B.head.rotation.z -= Math.sin(beat - 1.2) * 0.2 * env;
      B.root.position.y += Math.abs(Math.sin(beat)) * 0.004 * env;
      B.leafL.rotation.z += (0.35 + Math.sin(beat) * 0.45) * env;
      B.leafR.rotation.z -= (0.35 - Math.sin(beat) * 0.45) * env;
      this.blinker.hold = env * 0.5;
      if (!tr.a && t > 0.02) {
        tr.a = true;
        this.emit('sound', { name: 'dance' });
      }
      if (!tr.b && t > 1.2) {
        tr.b = true;
        this.emit('sparkle', { at: this.restPoint('head', [0, HC[1] + 0.02, 0.03]), count: 16, speed: 0.6, up: 0.7, size: 0.016 });
      }
      if (!tr.c && t > 2.3) {
        tr.c = true;
        this.emit('sound', { name: 'happy' });
      }
      return 1.05 + Math.sin(beat * 2) * 0.06 * env;
    }
    if (tr.name === 'sun') {
      // stretch up tall, face to the sky, petals wide; then relax with a bounce
      const up = ramp(t, 0.15, 0.8) * (1 - ramp(t, 1.9, 2.25));
      B.root.scale.set(1 - up * 0.05, 1 + up * 0.14, 1 - up * 0.05);
      B.head.rotation.x -= up * 0.55;
      B.stem2.rotation.x -= up * 0.12;
      B.leafL.rotation.z += up * 0.7;
      B.leafR.rotation.z -= up * 0.7;
      this.blinker.hold = up * 0.95;
      if (!tr.a && t > 0.15) {
        tr.a = true;
        this.emit('sound', { name: 'stretch' });
      }
      if (!tr.b && t > 0.9) {
        tr.b = true;
        this.emit('sparkle', { at: this.restPoint('head', [0, HC[1] + 0.03, 0.02]), count: 24, colors: [[2.2, 1.7, 0.7], [2.0, 1.3, 0.5]], speed: 0.5, up: 1.0, size: 0.018 });
      }
      if (!tr.c && t > 2.0) {
        tr.c = true;
        this.bob.kick(4);
        for (const sp of this.sway) sp.kick(0.8);
        this.emit('sound', { name: 'happy' });
      }
      return 1 + up * 0.28;
    }
    return undefined;
  }

  trickLength(name) {
    return { bloom: 2.6, dance: 2.8, sun: 2.6 }[name] || 2;
  }

  restPoint(bone, p) {
    const b = this.sculptor.bones[this.sculptor.index[bone]].pos;
    return this.bonePoint(bone, [p[0] - b[0], p[1] - b[1], p[2] - b[2]]);
  }
}

const _axis = new THREE.Vector3();
const STEMS = ['stem0', 'stem1', 'stem2'];
const PETALS = Array.from({ length: N }, (_, i) => 'petal' + i);

export const calls = {
  // a soft chime: ting-a-ling
  happy(a, t) {
    glide(a, t, [[0, 880], [0.1, 1175]], { type: 'sine', v: 0.09, formant: 1300, q: 0.8 });
    a.bell(1568, 0.03, t + 0.1, 0.7);
    a.bell(2093, 0.03, t + 0.2, 0.8);
  },
  shut(a, t) {
    glide(a, t, [[0, 700], [0.45, 420]], { type: 'sine', v: 0.06, formant: 900, q: 0.8 });
  },
  // bursting open: a rising shimmer and a flurry of bells
  bloom(a, t) {
    glide(a, t, [[0, 523], [0.35, 1047]], { type: 'sine', v: 0.06, formant: 1200, q: 0.8 });
    puff(a, t, { v: 0.04, from: 800, to: 3000, dur: 0.6 });
    for (const [i, f] of [1047, 1319, 1568, 2093, 2637].entries()) a.bell(f, 0.022, t + 0.1 + i * 0.06, 0.8);
  },
  // a little music-box tune to sway to
  dance(a, t) {
    for (const [i, f] of [1319, 1568, 1760, 1568, 1976].entries()) {
      a.bell(f, 0.035, t + i * 0.28, 0.7);
      a.bell(f / 2, 0.015, t + i * 0.28, 0.5);
    }
  },
  // a big stretch to the sun: a slow music-box climb on a warm breeze
  stretch(a, t) {
    puff(a, t, { v: 0.03, from: 500, to: 1400, dur: 0.9 });
    for (const [i, f] of [1047, 1319, 1568, 2093].entries()) a.bell(f, 0.028, t + i * 0.16, 0.9);
  },
  // growing up out of the ground: a soft rustle and a climb of little bells
  grow(a, t) {
    puff(a, t, { v: 0.025, from: 600, to: 2000, dur: 0.7 });
    for (const [i, f] of [1175, 1397, 1568, 2093].entries()) a.bell(f, 0.016, t + 0.1 + i * 0.08, 0.7);
  },
};

// ------------------------------------------------------------ geometry

// A petal from the disk's edge outwards at angle th: cupped across, leaning
// forward a little and curling back at the tip, rounded at the end with a
// slight notch. It glows lighter near its base.
function petalGeometry(c, th, r0, len, wid, { z = 0, fwd = 0.006, curl = 0.01, shade = 1, q = 1 }) {
  const nu = Math.round(12 * q) + 4;
  const nv = 8;
  const d = [Math.cos(th), Math.sin(th)];
  const tn = [-Math.sin(th), Math.cos(th)];
  const pos = [];
  const uu = [];
  const idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    // width: narrow at the base, widest past the middle, rounded at the tip
    const w = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.95)), 0.7) * (0.35 + 0.65 * Math.sqrt(u));
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * 2 - 1;
      // a small notch at the tip
      const notch = u > 0.9 ? Math.max(0, 1 - Math.abs(v) * 3) * (u - 0.9) * 0.08 : 0;
      const r = r0 + u * len - notch * len * 0.5;
      const across = v * w;
      const dz = z + fwd * u - curl * u * u * u + 0.004 * (1 - v * v) * Math.sin(Math.PI * u);
      pos.push(c[0] + d[0] * r + tn[0] * across, c[1] + d[1] * r + tn[1] * across, c[2] + dz);
      uu.push(u, v);
    }
  }
  const row = nv + 1;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  withLook(g, { tint: PETAL, paint: 0.92, rough: 0.55 });
  // lighter and more its own colour at the base, fine veins along it
  const mix = g.attributes.aMix;
  const base = new THREE.Color(0xfff0c8);
  const tip = new THREE.Color(PETAL);
  tintBy(g, (x, y, zz, col, k) => {
    const u = uu[k * 2];
    const v = uu[k * 2 + 1];
    const vein = 0.94 + 0.06 * Math.cos(v * 9.5);
    col.copy(base).lerp(tip, smooth(u * 2.2)).multiplyScalar(shade * vein);
    mix.setX(k, lerp(0.45, 0.95, smooth(u * 2.5)));
  });
  return g;
}

// A leaf from base along dir: a pointed oval folded a little along its
// midrib, drooping toward the tip. face: roughly where its top side looks.
function leafGeometry(base, dir, face, len, wid, { droop = 0.01, q = 1 }) {
  const D = new THREE.Vector3(...dir).normalize();
  const F = new THREE.Vector3(...face).normalize();
  const W = new THREE.Vector3().crossVectors(F, D).normalize();
  const Nn = new THREE.Vector3().crossVectors(D, W).normalize();
  const nu = Math.round(10 * q) + 4;
  const nv = 6;
  const pos = [];
  const uu = [];
  const idx = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const w = (wid / 2) * Math.pow(Math.sin(Math.PI * u), 0.85) * (1 - 0.35 * u);
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * 2 - 1;
      P.set(...base)
        .addScaledVector(D, u * len)
        .addScaledVector(W, v * w)
        .addScaledVector(Nn, Math.abs(v) * w * 0.3 - droop * u * u)
        .y -= droop * u * u * 0.6;
      pos.push(P.x, P.y, P.z);
      uu.push(u, v);
    }
  }
  const row = nv + 1;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  withLook(stripUv(g), { tint: GREEN, paint: 0.85, rough: 0.5 });
  const light = new THREE.Color(0x9ccc65);
  const dark = new THREE.Color(DEEP);
  tintBy(g, (x, y, z, col, k) => {
    const u = uu[k * 2];
    const v = Math.abs(uu[k * 2 + 1]);
    // a pale midrib and side veins
    const rib = 1 - smooth(v / 0.12);
    const side = Math.pow(0.5 + 0.5 * Math.cos((u * 7 - v * 3) * Math.PI), 8) * 0.5;
    col.copy(dark).lerp(new THREE.Color(GREEN), 0.6 + 0.4 * u).lerp(light, Math.max(rib * 0.7, side * 0.4));
  });
  return g;
}
