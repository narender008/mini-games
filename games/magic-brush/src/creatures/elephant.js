// Poppy, a baby elephant: a big round head with a soft domed brow, huge
// flappy ears with pink insides, a wrinkly trunk that curls and sways on a
// chain of springs, big eyes with long lashes, sturdy legs with pale
// toenails, a wisp of hair on top and a little tufted tail. Velvety skin
// with a fine network of creases carries the child's colours.
//
// Tricks: 'trumpet' (breathes in, curls her trunk high and trumpets a
// fountain of sparkly water), 'flutter' (flaps her ears so fast she hops
// off the ground) and 'balance' (a wobbly circus balance on one front
// foot, trunk up, ears out). She walks with a slow, heavy plod.
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, bindBy, frameFrom } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { pose, addPose, bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp } from './anim.js';
import { Tracker, Leg, Gait, hairClump, hairMaterial } from './pal-kit.js';
import { glide, puff, flaps } from '../sound/calls.js';
import { rand } from '../config.js';

const SKIN = 0xa9b9dc;
const PINK = 0xf3a9c6;
const PINK_DEEP = 0xe28aae;
const NAIL = 0xf4ecdf;
const MOUTH = 0x7a3048;
const TONGUE = 0xe8768e;
const LASH = 0x262233;
const HAIR = 0x5d6177;

const EYE = [0.041, 0.205, 0.138];
const EYE_DIR = [0.62, 0.08, 0.78];
// the trunk's rest line, from the face down to the tip
const TRUNK = [[0, 0.176, 0.148], [0, 0.15, 0.174], [0, 0.124, 0.19], [0, 0.1, 0.2], [0, 0.081, 0.212], [0, 0.071, 0.228], [0, 0.072, 0.244]];
// per-frame constants and scratch (no allocations while animating)
const PLOD = [0.25, 0.75, 0, 0.5]; // left hind, left fore, right hind, right fore
const TRUNK_B = ['trunk0', 'trunk1', 'trunk2', 'trunk3', 'trunk4', 'trunk5'];
const HOPS = [[0.7, 1.25, 0.045], [1.4, 1.9, 0.034]]; // 'flutter': start, landing, height
const EAR_TIPS = ['earTipL', 'earTipR'];
const _step = [0, 0];
const TRUNK_R = [0.027, 0.021, 0.0175, 0.015, 0.0132, 0.0125, 0.0122];

// A big ear: a rounded flap hinged at the side of the head, thicker at the
// middle, cupped a little; pink on the inside (the side facing forward).
function earGeometry(side, I) {
  const H = new THREE.Vector3(0.05 * side, 0.2, 0.074); // hinge centre
  const out = new THREE.Vector3(0.82 * side, 0.02, -0.57).normalize(); // across the ear, away from the head
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3().crossVectors(out, up).normalize().multiplyScalar(side); // the inside faces forward
  up.crossVectors(n, out).normalize().multiplyScalar(side);
  const a = 0.058, b = 0.066;
  const cx = 0.046, cy = -0.01; // ellipse centre in (out, up)
  const rings = 14, segs = 56;
  const pos = [];
  const tint = [];
  const mix = [];
  const idx = [];
  const skin = new THREE.Color(SKIN);
  const pink = new THREE.Color(PINK);
  const deep = new THREE.Color(PINK_DEEP);
  const c = new THREE.Color();
  const thick = (r) => 0.0065 * (1 - r * r) + 0.0016;
  const cup = (r) => 0.012 * (1 - r * r);
  const shape = (phi) => 1 + 0.06 * Math.sin(phi * 3 + 0.5) * Math.max(0, -Math.sin(phi)); // a wavy lower lobe
  for (let face = 0; face < 2; face++) {
    const sgn = face === 0 ? 1 : -1; // 0: inside (front), 1: outside (back)
    const base = pos.length / 3;
    for (let i = 0; i <= rings; i++) {
      const r = i / rings;
      for (let j = 0; j <= segs; j++) {
        const phi = (j / segs) * TAU;
        const k = shape(phi);
        const s = cx + a * r * k * Math.cos(phi);
        const t = cy + b * r * k * Math.sin(phi) * (Math.sin(phi) < 0 ? 1.12 : 1);
        const p = H.clone().addScaledVector(out, s).addScaledVector(up, t).addScaledVector(n, cup(r) + (sgn * thick(r)) / 2);
        pos.push(p.x, p.y, p.z);
        if (face === 0) {
          // inside: pink with darker veins fanning out, skin at the rim
          const vein = Math.pow(Math.abs(Math.sin(phi * 5 + r * 3)), 30) * smooth((r - 0.2) / 0.4) * (1 - smooth((r - 0.8) / 0.15));
          const rim = smooth((r - 0.78) / 0.18);
          c.copy(pink).lerp(deep, vein * 0.8).lerp(skin, rim);
          tint.push(c.r, c.g, c.b);
          mix.push(lerp(0.28, 1, rim), 0, 0.62, lerp(0.08, 0.3, rim));
        } else {
          tint.push(skin.r, skin.g, skin.b);
          mix.push(1, 0, 0.66, 0.2);
        }
      }
    }
    const row = segs + 1;
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < segs; j++) {
        const i0 = base + i * row + j;
        if (face === 0) idx.push(i0, i0 + row, i0 + 1, i0 + 1, i0 + row, i0 + row + 1);
        else idx.push(i0, i0 + 1, i0 + row, i0 + 1, i0 + row + 1, i0 + row);
      }
  }
  // the rim joining the two faces
  const row = segs + 1;
  const f0 = rings * row;
  const f1 = (rings + 1) * row + rings * row;
  for (let j = 0; j < segs; j++) idx.push(f0 + j, f1 + j, f0 + j + 1, f0 + j + 1, f1 + j, f1 + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 3));
  g.setAttribute('aMix', new THREE.Float32BufferAttribute(mix, 4));
  // the right ear is mirrored: flip its winding
  g.setIndex(side > 0 ? idx : idx.map((v, i) => (i % 3 === 1 ? idx[i + 1] : i % 3 === 2 ? idx[i - 1] : v)));
  g.computeVertexNormals();
  // weights: the root in the head, the flap on the ear bone, the far edge on the tip bone
  const S = side > 0 ? 'L' : 'R';
  bindBy(g, (x, y, z) => {
    const d = (x - H.x) * out.x + (y - H.y) * out.y + (z - H.z) * out.z;
    const k = smooth((d - 0.004) / 0.03);
    const k2 = smooth((d - 0.05) / 0.04);
    return [[I.head, 1 - k], [I['ear' + S], k * (1 - k2)], [I['earTip' + S], k * k2]];
  });
  return g;
}

export class Elephant extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { scales: true, sheen: 0.55, clearcoat: 0.15 };
    this.shared.uScale.value = 0.0042;
    this.shared.uSplat.value = 0.2;
    this.walkSpeed = 0.17;
    this.turnRate = 1.5;
    this.hopScale = 0.7;
    this.sparkleColors = [[0.9, 1.4, 2.0], [1.8, 1.6, 1.9], [1.9, 1.3, 1.6]];
    this.phase = 0;
    this.track = new Tracker();
    this.headYaw = new Spring(0, 1.1, 0.8);
    this.headPitch = new Spring(0, 1.1, 0.8);
    this.trunkX = [0, 1, 2, 3, 4, 5].map((i) => new Spring(0, 1.6 - i * 0.12, 0.38));
    this.trunkY = [0, 1, 2, 3, 4, 5].map((i) => new Spring(0, 1.4 - i * 0.1, 0.35));
    this.earL = new Spring(0, 2.2, 0.3);
    this.earR = new Spring(0, 2.2, 0.3);
    this.tailS = new Spring(0, 1.5, 0.3);
    this.flapTimer = 3;
    this.curlTimer = 6;
    this.curl = new Spring(0, 0.8, 0.5);
    this.curlTarget = 0;
    this.prevBob = 0;
  }

  get tricks() {
    return ['trumpet', 'flutter', 'balance'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0.12, 0]);
    s.bone('hips', 'root', [0, 0.125, -0.042]);
    s.bone('chest', 'root', [0, 0.125, 0.035]);
    s.bone('neck', 'chest', [0, 0.15, 0.06]);
    s.bone('head', 'neck', [0, 0.18, 0.085]);
    s.bone('jaw', 'head', [0, 0.158, 0.126]);
    this.eyeBones(s, EYE);
    s.bones2('ear', 'head', [0.05, 0.2, 0.074]);
    s.bones2('earTip', 'ear', [0.1, 0.2, 0.04]);
    for (let i = 0; i < 6; i++) s.bone('trunk' + i, i === 0 ? 'head' : 'trunk' + (i - 1), TRUNK[i]);
    s.bone('tail0', 'hips', [0, 0.135, -0.1]);
    s.bone('tail1', 'tail0', [0, 0.105, -0.112]);
    s.bones2('shoulder', 'chest', [0.042, 0.1, 0.048]);
    s.bones2('elbow', 'shoulder', [0.042, 0.058, 0.052]);
    s.bones2('paw', 'elbow', [0.042, 0.02, 0.052]);
    s.bones2('thigh', 'hips', [0.045, 0.104, -0.05]);
    s.bones2('knee', 'thigh', [0.045, 0.06, -0.048]);
    s.bones2('foot', 'knee', [0.045, 0.02, -0.05]);

    const skin = { paint: 1, fur: 0, rough: 0.68, pat: 0.2, tint: SKIN };
    s.setLook(skin);
    // body: a big round barrel
    s.ellipsoid([0, 0.132, 0.03], [0.066, 0.064, 0.064], { bone: 'chest', k: 0.03 });
    s.ellipsoid([0, 0.132, -0.04], [0.066, 0.064, 0.062], { bone: 'hips', k: 0.05 });
    s.ellipsoid([0, 0.108, -0.002], [0.058, 0.048, 0.078], { bone: 'root', k: 0.04, pat: 0.4 });
    // head: a big domed head on a short thick neck, soft cheeks
    s.ellipsoid([0, 0.16, 0.06], [0.05, 0.05, 0.04], { bone: 'neck', k: 0.04 });
    s.ellipsoid([0, 0.2, 0.098], [0.066, 0.064, 0.058], { bone: 'head', k: 0.035 });
    s.sphere([0.022, 0.248, 0.11], 0.026, { bone: 'head', k: 0.025, sym: true, pat: 0.4 });
    s.sphere([0.036, 0.176, 0.118], 0.03, { bone: 'head', k: 0.03, sym: true, pat: 0.4 });
    // a rosy blush on each cheek
    s.sphere([0.052, 0.18, 0.13], 0.011, { bone: 'head', k: 0.012, sym: true, tint: 0xf49ab8, paint: 0.4, pat: 0.2 });
    // eye sockets: smooth skin round the eyes
    s.sphere(EYE, 0.021, { bone: 'head', k: 0.006, sym: true, pat: 0.1 });
    // the trunk: a tapering chain, flared at the tip, with a nostril
    for (let i = 0; i < TRUNK.length - 1; i++)
      s.cone(TRUNK[i], TRUNK[i + 1], TRUNK_R[i], TRUNK_R[i + 1], { bone: 'trunk' + Math.min(5, i), k: i === 0 ? 0.03 : 0.012, pat: 0.3 });
    s.ellipsoid([0, 0.073, 0.243], [0.0142, 0.0138, 0.009], { bone: 'trunk5', k: 0.008, pat: 0.1, tint: 0xc4b6d6, paint: 0.7, rot: [-0.5, 0, 0] });
    s.ellipsoid([0, 0.0745, 0.251], [0.0088, 0.0082, 0.005], { bone: 'trunk5', k: 0.003, sub: true, tint: PINK_DEEP, paint: 0, pat: 0, rot: [-0.5, 0, 0] });
    // wrinkle rings along the trunk
    for (let i = 0; i < 8; i++) {
      const u = 0.14 + i * 0.1;
      const f = u * (TRUNK.length - 1);
      const a = Math.min(TRUNK.length - 2, Math.floor(f));
      const k = f - a;
      const p = [0, lerp(TRUNK[a][1], TRUNK[a + 1][1], k), lerp(TRUNK[a][2], TRUNK[a + 1][2], k)];
      const dir = [0, TRUNK[a + 1][1] - TRUNK[a][1], TRUNK[a + 1][2] - TRUNK[a][2]];
      const tilt = Math.atan2(dir[2], -dir[1]);
      const R = lerp(TRUNK_R[a], TRUNK_R[a + 1], k);
      s.torus(p, R * 1.03, 0.0009, { bone: 'trunk' + Math.min(5, a), sub: true, k: 0.002, rot: [-tilt, 0, 0], tint: 0x8a93b8, paint: 0.8, pat: 0.2 });
    }
    // mouth: a little smile under the trunk, a chin on the jaw
    s.ellipsoid([0, 0.152, 0.134], [0.02, 0.011, 0.018], { bone: 'jaw', k: 0.012, tint: 0xd8b8cf, paint: 0.5, pat: 0.2 });
    s.torus([0, 0.158, 0.128], 0.02, 0.0022, { bone: 'head', sub: true, k: 0.004, rot: [0.5, 0, 0], tint: MOUTH, paint: 0, pat: 0 });
    // legs: sturdy columns with round flat feet
    for (const [x, zs, zk, zf, hip, knee, foot, top] of [
      [0.042, 0.046, 0.052, 0.052, 'shoulderL', 'elbowL', 'pawL', 0.11],
      [0.045, -0.046, -0.048, -0.05, 'thighL', 'kneeL', 'footL', 0.115],
    ]) {
      s.ellipsoid([x + 0.002, top, zs], [0.03, 0.04, 0.034], { bone: hip, k: 0.035, sym: true });
      s.cone([x, top - 0.01, zs], [x, 0.058, zk], 0.026, 0.022, { bone: hip, k: 0.015, sym: true });
      s.cone([x, 0.058, zk], [x, 0.024, zf], 0.022, 0.0215, { bone: knee, k: 0.01, sym: true });
      s.box([x, 0.0115, zf + 0.002], [0.0225, 0.0115, 0.0235], 0.0105, { bone: foot, k: 0.008, sym: true, pat: 0.35 });
      // a paler sole
      s.box([x, 0.0015, zf + 0.002], [0.019, 0.0015, 0.02], 0.0012, { bone: foot, k: 0.004, sym: true, tint: 0xcfc6d8, paint: 0.3, pat: 0.8 });
    }
    // tail
    s.cone([0, 0.14, -0.098], [0, 0.105, -0.112], 0.007, 0.004, { bone: 'tail0', k: 0.012 });
    s.cone([0, 0.105, -0.112], [0, 0.08, -0.115], 0.004, 0.0035, { bone: 'tail1', k: 0.006 });
  }

  parts(s) {
    const I = s.index;
    this.addEyes(s, {
      c: EYE,
      r: 0.021,
      dir: EYE_DIR,
      iris: 0x5a86d8,
      iris2: 0x2a3f8a,
      irisSize: 0.92,
      pupil: 0.44,
      lid: { tint: SKIN, paint: 1, pat: 0.2, rough: 0.7, open: -0.35, closed: 1.5 },
    });
    // long lashes on the upper lids
    const lashMat = this.mat('solid', { clearcoat: 0.3 });
    for (const side of [1, -1]) {
      const r = 0.021 * 1.07;
      const f = frameFrom([EYE_DIR[0] * side, EYE_DIR[1], EYE_DIR[2]]);
      const c = new THREE.Vector3(EYE[0] * side, EYE[1], EYE[2]);
      const toWorld = (x, y, z) => {
        const yy = y * Math.cos(-0.35) - z * Math.sin(-0.35);
        const zz = y * Math.sin(-0.35) + z * Math.cos(-0.35);
        return c.clone().addScaledVector(f.x, x).addScaledVector(f.y, yy).addScaledVector(f.z, zz).toArray();
      };
      const list = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const psi = lerp(-0.9, 1.2, u) * side;
        const outer = clamp((psi * side + 0.3) / 1.5, 0, 1);
        const len = 0.006 + 0.008 * outer;
        const ox = Math.sin(psi), oz = Math.cos(psi);
        const p0 = toWorld(ox * r * 0.97, 0, oz * r * 0.97);
        const p1 = toWorld(ox * (r + len * 0.5), len * 0.3, oz * (r + len * 0.5));
        const p2 = toWorld(ox * (r + len * 0.9), len * 0.85, oz * (r + len * 0.55));
        const g = tubeGeometry([p0, p1, p2], [0.0011, 0.0007, 0.0002], { radial: 5, steps: 6 });
        withLook(g, { tint: LASH, rough: 0.4 });
        list.push(g);
      }
      this.addMesh(bindTo(mergeGeometries(list), I['lid' + (side > 0 ? 'L' : 'R')]), lashMat, { shadow: false }).userData.noProject = true;
    }

    // ears: big flaps with pink insides
    for (const side of [1, -1]) {
      const m = this.addMesh(earGeometry(side, I), this.hide);
      m.userData.region = 3;
    }

    // toenails: three pale glossy nails on the front of each foot
    const nailMat = this.mat('solid', { clearcoat: 1 });
    const nails = [];
    for (const [x, z, bone] of [[0.042, 0.054, 'paw'], [0.045, -0.048, 'foot']])
      for (const side of [1, -1])
        for (let k = -1; k <= 1; k++) {
          const a = k * 0.62;
          const g = new THREE.SphereGeometry(0.0075, 12, 8, 0, TAU, 0, Math.PI / 2);
          g.scale(1.1, 1.05, 0.62);
          g.rotateX(Math.PI / 2 - 0.2);
          g.rotateY(a);
          g.translate(x * side + Math.sin(a) * 0.0245, 0.0068, z + Math.cos(a) * 0.0245);
          g.deleteAttribute('uv');
          withLook(g, { tint: NAIL, paint: 0.1, rough: 0.25 });
          bindTo(g, I[bone + (side > 0 ? 'L' : 'R')]);
          nails.push(g);
        }
    this.addMesh(mergeGeometries(nails), nailMat, { shadow: false });

    // a wisp of hair on top of her head and a tuft on her tail
    const hairMat = hairMaterial(this, { sheen: 0.4, strands: 0.5, key: 'elephant' });
    const hairs = [];
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 7; i++) {
      const x = (rnd() - 0.5) * 0.02;
      const z = 0.092 + (rnd() - 0.5) * 0.02;
      const lean = (rnd() - 0.5) * 0.02;
      const pts = [[x, 0.258, z], [x + lean * 0.3, 0.272, z + 0.004], [x + lean, 0.284, z + 0.012], [x + lean * 1.6, 0.286, z + 0.024]];
      const g = hairClump(pts, 0.0028, 0.0014, { side: [0, 0, 1], seed: rnd(), steps: 10, swell: 0.2 });
      withLook(g, { tint: HAIR, paint: 0.3, rough: 0.5 });
      bindTo(g, I.head);
      hairs.push(g);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const pts = [[0, 0.086, -0.115], [Math.cos(a) * 0.003, 0.074, -0.116 + Math.sin(a) * 0.003], [Math.cos(a) * 0.006, 0.062, -0.115 + Math.sin(a) * 0.006]];
      const g = hairClump(pts, 0.0035, 0.0018, { side: [Math.cos(a), 0, Math.sin(a)], seed: rnd(), steps: 8, swell: 0.3 });
      withLook(g, { tint: HAIR, paint: 0.3, rough: 0.5 });
      bindTo(g, I.tail1);
      hairs.push(g);
    }
    this.addMesh(mergeGeometries(hairs), hairMat, { shadow: false });

    // inside of the mouth and a tongue
    const inside = new THREE.SphereGeometry(0.015, 14, 10);
    inside.scale(1.1, 0.55, 1.1).translate(0, 0.156, 0.124);
    withLook(inside, { tint: MOUTH, rough: 0.5 });
    this.addMesh(bindTo(inside, I.head), this.mat('solid'), { shadow: false }).userData.noProject = true;
    const tongue = new THREE.SphereGeometry(0.01, 14, 8);
    tongue.scale(1.1, 0.4, 1.3).translate(0, 0.153, 0.128);
    withLook(tongue, { tint: TONGUE, rough: 0.35 });
    this.addMesh(bindTo(tongue, I.jaw), this.mat('solid', { clearcoat: 0.6 }), { shadow: false }).userData.noProject = true;
  }

  // ------------------------------------------------------------ motion

  makeLegs() {
    return [
      new Leg(this, 'shoulderL', 'elbowL', 'pawL', 1),
      new Leg(this, 'shoulderR', 'elbowR', 'pawR', 1),
      new Leg(this, 'thighL', 'kneeL', 'footL', 1),
      new Leg(this, 'thighR', 'kneeR', 'footR', 1),
    ];
  }

  trunkTip(out) {
    return this.bonePoint('trunk5', [0, 0.075 - TRUNK[5][1], 0.252 - TRUNK[5][2]], out);
  }

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    this.legs ??= this.makeLegs();
    const tr = this.track.update(this.object, dt);
    const speed = m.speed;
    const air = m.air;
    const moving = clamp(speed / 0.1, 0, 1) * (1 - air);
    const freq = lerp(0.8, 1.05, clamp(speed / 0.17, 0, 1)) * 0.85; // (a slower cadence with longer strides steps more smoothly)
    this.phase += dt * freq;
    const ph = this.phase;
    const duty = 0.68;
    const breathe = Math.sin(t * 1.5);
    const gait = (this.gait ??= new Gait(4));
    gait.begin(tr, air, dt);

    const L = (this.legState ??= [0, 1, 2, 3].map(() => ({ plant: 1, off: new THREE.Vector3(), toe: 0, lift: 0, dz: 0 })));
    for (const l of L) {
      l.plant = 1 - air;
      l.off.set(0, 0, 0);
      l.toe = 0;
      l.lift = 0;
      l.dz = 0;
    }
    this.earOut = 0;
    this.earFlap = 0;
    this.trunkUp = 0;

    // body: slow breathing, a heavy side-to-side roll and a dip on each step
    B.chest.scale.set(1 + breathe * 0.012, 1 + breathe * 0.015, 1 + breathe * 0.01);
    const sway = Math.sin(ph * TAU);
    const dip = Math.cos(ph * TAU * 2);
    const bob = (-0.003 + 0.003 * dip) * moving - 0.0015;
    B.root.position.y += bob;
    B.root.position.x += sway * 0.004 * moving + Math.sin(t * 0.35) * 0.0025 * (1 - moving);
    B.root.rotation.z = -sway * 0.045 * moving + Math.sin(t * 0.35) * 0.02 * (1 - moving);
    B.root.rotation.y = sway * 0.03 * moving;
    B.root.rotation.x = Math.sin(ph * TAU * 2 + 0.8) * 0.012 * moving;

    // head: a slow look about, nodding with her steps
    let yaw = Math.sin(t * 0.3) * 0.25 + Math.sin(t * 0.11) * 0.2;
    let pitch = Math.sin(t * 0.23) * 0.07;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z - 0.08), -0.6, 0.6);
      pitch = clamp(-Math.atan2(this.lookLocal.y - 0.2, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.35, 0.3);
    }
    const hy = this.headYaw.update(yaw * (1 - moving * 0.5), dt);
    const hp = this.headPitch.update(pitch, dt);
    const nod = Math.sin(ph * TAU * 2 - 0.4) * 0.035 * moving;
    pose(B.neck, hp * 0.4 + breathe * 0.01, hy * 0.4, 0);
    pose(B.head, hp * 0.6 + nod, hy * 0.6, Math.sin(t * 0.43) * 0.07 * (1 - moving) - sway * 0.03 * moving);
    pose(B.jaw, 0.03 + Math.max(0, Math.sin(t * 0.5)) * 0.04, 0, 0);

    // gait: a four-beat plod (left hind, left fore, right hind, right fore)
    for (let i = 0; i < 4; i++) {
      gait.step(i, ph + PLOD[i], duty, freq, 0.018 * moving, 0.013, _step);
      L[i].dz = _step[0];
      L[i].lift = _step[1];
      L[i].toe += 0.4 * (_step[1] / 0.018);
    }

    // in the air: legs tucked, trunk up, ears out
    if (air > 0) {
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        L[i].off.set(0, 0.02 * air, front ? 0.015 * air : -0.015 * air);
        L[i].toe += 0.4 * air;
      }
      this.earOut += 0.8 * air;
      this.trunkUp += 0.8 * air;
    }

    // now and then: a slow curl of the trunk, a lazy flap of the ears
    this.curlTimer -= dt;
    if (this.curlTimer <= 0) {
      this.curlTimer = rand(4, 9);
      this.curlTarget = this.curlTarget > 0 ? 0 : rand(0.4, 1);
    }
    const curl = this.curl.update(this.curlTarget * (1 - moving), dt);
    this.flapTimer -= dt;
    if (this.flapTimer <= 0) {
      this.flapTimer = rand(2.5, 6);
      this.earL.kick(rand(5, 9));
      this.earR.kick(rand(5, 9));
    }

    if (this.trick) this.trickPose(this.trick, dt, L);

    // legs: planted with IK
    const tg = (this._tg ??= new THREE.Vector3());
    for (let i = 0; i < 4; i++) {
      const l = L[i];
      tg.copy(this.legs[i].foot);
      tg.z += l.dz;
      tg.y += l.lift;
      this.legs[i].solve(tg, l.plant, l.off, l.toe);
    }

    // ears: flap gently with her steps, lag behind turns, spread for tricks
    const turn = clamp(tr.yawRate * 0.3 - tr.acc.x * 0.03, -0.5, 0.5);
    const eL = this.earL.update(turn + this.earOut, dt);
    const eR = this.earR.update(-turn + this.earOut, dt);
    const stepFlap = Math.sin(ph * TAU * 2) * 0.08 * moving;
    const fl = this.earFlap;
    pose(B.earL, 0, -(eL * 0.4 + stepFlap + fl * 0.9), eL * 0.08 + fl * 0.15);
    pose(B.earR, 0, eR * 0.4 + stepFlap + fl * 0.9, -eR * 0.08 - fl * 0.15);
    pose(B.earTipL, 0, -(eL * 0.25 + fl * 0.5), 0);
    pose(B.earTipR, 0, eR * 0.25 + fl * 0.5, 0);

    // trunk: a spring chain that sways with the head and the steps, curls up now and then
    const bobV = (bob - this.prevBob) / Math.max(dt, 1e-3);
    this.prevBob = bob;
    let px = clamp(bobV * 2, -0.3, 0.3) + hp * -0.3 + clamp(tr.acc.z * 0.04, -0.3, 0.3);
    let py = -hy * 0.5 + clamp(tr.acc.x * 0.05 - tr.yawRate * 0.15, -0.4, 0.4) + Math.sin(t * 0.7) * 0.12 + sway * 0.15 * moving;
    for (let i = 0; i < 6; i++) {
      const cx = this.trunkX[i].update(px, dt);
      const cy = this.trunkY[i].update(py, dt);
      // curling: the lower trunk curls up and forward (negative x), more toward the tip
      const c = curl * (0.12 + i * 0.1) + this.trunkUp * (i < 3 ? 0.45 : 0.25);
      pose(B[TRUNK_B[i]], cx * 0.18 - c + Math.sin(t * 1.3 - i * 0.7) * 0.03, cy * (0.12 + i * 0.02), 0);
      px = cx;
      py = cy;
    }

    // tail: a lazy swish
    const ts = this.tailS.update(Math.sin(t * 1.1) * 0.4 + sway * 0.4 * moving - turn, dt);
    pose(B.tail0, 0.1, 0, ts * 0.5);
    pose(B.tail1, 0.1, 0, ts * 0.4);
  }

  // pitch the whole body by ang about a sideways axis through the ground at z = pz
  pivotX(ang, pz) {
    const root = this.bones.root;
    const dy = 0.12; // the root's rest height
    const dz = -pz;
    root.position.y += dy * Math.cos(ang) - dz * Math.sin(ang) - dy;
    root.position.z += dy * Math.sin(ang) + dz * Math.cos(ang) - dz;
    root.rotation.x += ang;
  }

  // roll the whole body by ang about a lengthwise axis through the ground at x = px
  pivotZ(ang, px) {
    const root = this.bones.root;
    const dx = -px;
    const dy = 0.12;
    root.position.x += dx * Math.cos(ang) - dy * Math.sin(ang) - dx;
    root.position.y += dx * Math.sin(ang) + dy * Math.cos(ang) - dy;
    root.rotation.z += ang;
  }

  trickPose(tr, dt, L) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'trumpet') {
      // breathe in (head back, chest swells, trunk curls), then TRUMPET: trunk
      // high, ears wide, a fountain of sparkly water, then a happy shake
      const inhale = ramp(t, 0.1, 0.8) * (1 - ramp(t, 0.85, 1.0));
      const blow = ramp(t, 0.8, 0.95) * (1 - ramp(t, 1.9, 2.4));
      const shake = bump(t, 2.1, 2.7);
      B.chest.scale.multiplyScalar(1 + inhale * 0.06);
      this.pivotX(-0.12 * inhale - 0.16 * blow, -0.049);
      addPose(B.neck, -0.15 * inhale - 0.2 * blow, 0, 0);
      addPose(B.head, -0.1 * inhale - 0.2 * blow, Math.sin(t * 30) * 0.02 * blow, Math.sin(t * 22) * 0.2 * shake);
      addPose(B.jaw, 0.35 * blow, 0, 0);
      this.trunkUp += 1.2 * inhale + 2.2 * blow;
      this.earOut += 0.5 * inhale + 1.4 * blow;
      this.earFlap += Math.sin(t * 24) * 0.15 * blow;
      for (let i = 0; i < 2; i++) L[i].lift += Math.max(0, Math.sin(t * 8 + i * Math.PI)) * 0.012 * blow;
      if (!tr.s1 && t > 0.85) {
        tr.s1 = true;
        this.emit('sound', { name: 'trumpet' });
      }
      tr.next ??= 0.95;
      if (t > tr.next && t < 1.8) {
        tr.next += 0.12;
        const at = this.trunkTip(new THREE.Vector3());
        this.emit('splash', { at, count: 14, up: 1.2, color: new THREE.Color(0.75, 0.9, 1.0) });
        if (!tr.sp) {
          tr.sp = true;
          this.emit('puff', { at, dir: this.bonePoint('trunk5', [0, 0.4, 0.1]), colors: [[0.9, 1.5, 2.0], [1.8, 1.8, 2.0], [1.5, 1.2, 1.9]], count: 90, speed: 1.3, push: 1.2 });
        }
      }
      if (!tr.s2 && t > 2.1) {
        tr.s2 = true;
        this.emit('sound', { name: 'happy' });
      }
    } else if (tr.name === 'flutter') {
      // ears flap faster and faster until she hops off the ground, twice
      const flap = ramp(t, 0.0, 0.4) * (1 - ramp(t, 2.0, 2.4));
      const speedUp = lerp(10, 26, ramp(t, 0.1, 0.8));
      this.earFlapPh = (this.earFlapPh || 0) + dt * speedUp;
      this.earFlap += Math.sin(this.earFlapPh) * 0.9 * flap;
      this.earOut += 0.9 * flap;
      // two hops, each landing with a squash that springs back
      let hop = 0;
      let lift = 0;
      let land = 0;
      for (let i = 0; i < HOPS.length; i++) {
        const [a, b, h] = HOPS[i];
        if (t > a && t < b) {
          hop = Math.sin(((t - a) / (b - a)) * Math.PI);
          lift = hop * h;
        }
        land += Math.abs(wobble(t - b, 2.2, 0.45)) * (h / 0.045);
      }
      B.root.position.y += lift - bump(t, 0.4, 0.7) * 0.01 - land * 0.008;
      B.root.scale.set(1 + land * 0.05, 1 - land * 0.06, 1 + land * 0.05);
      for (let i = 0; i < 4; i++) {
        L[i].plant = 1 - clamp(hop * 3, 0, 1);
        L[i].off.set(0, 0.012 * hop, 0);
        L[i].toe += 0.5 * hop;
      }
      this.trunkUp += 0.9 * hop + 0.3 * flap;
      addPose(B.head, -0.12 * flap, 0, 0);
      addPose(B.jaw, 0.25 * flap, 0, 0);
      if (!tr.s1 && t > 0.1) {
        tr.s1 = true;
        this.emit('sound', { name: 'flutter' });
      }
      tr.next ??= 0.8;
      if (t > tr.next && t < 2.0) {
        tr.next += 0.25;
        for (const tip of EAR_TIPS) this.emit('sparkle', { at: this.bonePoint(tip), count: 6, colors: [[1.8, 1.6, 1.9], [1.9, 1.3, 1.6]], speed: 0.3, up: 0.3, size: 0.015, life: 1 });
      }
      // a plop and a little puff of sparkle on each real landing
      tr.landings ??= 0;
      if (tr.landings < HOPS.length && t > HOPS[tr.landings][1]) {
        tr.landings++;
        this.emit('land', { at: this.bonePoint('root', [0, -0.12, 0]) });
        this.emit('sound', { name: 'plop' });
      }
    } else if (tr.name === 'balance') {
      // shifts her weight onto her left front foot and lifts the others,
      // wobbling, trunk up and ears out like a tightrope walker's arms
      const up = ramp(t, 0.35, 0.8) * (1 - ramp(t, 2.0, 2.4));
      const wob = Math.sin(t * 6.5) * up;
      const land = wobble(t - 2.4, 2.2, 0.6);
      this.pivotX(0.28 * up + wob * 0.04, 0.052);
      this.pivotZ(-0.1 * up - wob * 0.05, 0.042);
      B.root.position.y -= Math.abs(land) * 0.006 + bump(t, 0.0, 0.4) * 0.008;
      for (let i = 1; i < 4; i++) {
        L[i].plant = 1 - up;
        L[i].off.set(0, 0.02 * up, i === 1 ? 0.02 * up : -0.012 * up);
        L[i].toe += 0.4 * up;
      }
      addPose(B.neck, -0.25 * up, 0, 0);
      addPose(B.head, -0.1 * up, wob * 0.15, -wob * 0.1);
      this.trunkUp += 1.6 * up;
      this.earOut += 1.3 * up;
      this.earFlap += wob * 0.2;
      addPose(B.jaw, 0.2 * up, 0, 0);
      if (!tr.s1 && t > 0.4) {
        tr.s1 = true;
        this.emit('sound', { name: 'balance' });
      }
      if (!tr.landed && t > 2.4) {
        tr.landed = true;
        this.emit('land', { at: this.bonePoint('root', [0, -0.12, 0]) });
        this.emit('sound', { name: 'plop' });
      }
      if (!tr.sp && t > 1.2) {
        tr.sp = true;
        this.emit('sparkle', { at: this.trunkTip(new THREE.Vector3()), count: 22, colors: [[1.9, 1.6, 1.0], [1.4, 1.6, 2.0]], speed: 0.5, up: 0.6, size: 0.017 });
      }
    }
  }

  trickLength(name) {
    return { trumpet: 2.8, flutter: 2.7, balance: 2.9 }[name] || 2;
  }
}

// ------------------------------------------------------------ sounds

// a baby elephant's toot: a buzzy glide through a trunk-like formant
function toot(a, t, { v = 0.08, f = 1, dur = 0.5, rise = 1.6 } = {}) {
  glide(a, t, [[0, 330 * f], [dur * 0.35, 330 * f * rise], [dur, 290 * f * rise]], { v, type: 'sawtooth', formant: 1100, q: 2.2, vibrato: 14, trill: 11, trillDepth: 0.35, breath: 0.4, attack: 0.03 });
}

export const calls = {
  happy(a, t) {
    toot(a, t, { v: 0.07, f: 1.25, dur: 0.32, rise: 1.4 });
    toot(a, t + 0.36, { v: 0.06, f: 1.4, dur: 0.22, rise: 1.3 });
  },
  trumpet(a, t) {
    toot(a, t, { v: 0.07, f: 1.1, dur: 0.95, rise: 1.9 });
    puff(a, t + 0.08, { v: 0.04, from: 1200, to: 5200, dur: 0.9 });
    for (let i = 0; i < 8; i++) a.bell(rand(1600, 3600), 0.02, t + 0.2 + i * 0.09, 0.5);
  },
  flutter(a, t) {
    flaps(a, t, 10, 0.12, 0.09);
    flaps(a, t + 1.2, 6, 0.09, 0.07);
    toot(a, t + 0.85, { v: 0.05, f: 1.5, dur: 0.25, rise: 1.3 });
  },
  balance(a, t) {
    // a wobbly "wheee"
    glide(a, t, [[0, 520], [0.3, 760], [0.6, 620], [0.9, 820], [1.3, 700]], { v: 0.05, formant: 1300, q: 1.4, vibrato: 30, breath: 0.2 });
  },
  plop(a, t) {
    puff(a, t, { v: 0.09, from: 180, to: 320, dur: 0.18 });
    a.bell(880, 0.02, t + 0.03, 0.4);
  },
};
