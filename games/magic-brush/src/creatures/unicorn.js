// Lumi, a baby unicorn: a big round foal's head with a short soft muzzle and
// a little smile, big glossy lilac eyes set in fluffy rims with curling
// lashes, soft short fur that carries the child's colours, a silky mane and
// tail that swing and stream as she moves, a pearly spiral horn that
// shimmers with rainbow colours, and little glossy hooves under fluffy
// fetlocks.
//
// Tricks: 'rear' (crouches, rears up pawing the air and a burst of
// sparkles shoots from her horn), 'spin' (a hop and a twirl in a ring of
// rainbow sparkles) and 'gallop' (a bouncy rocking-horse canter on the
// spot, tail flying). She walks with a high-stepping prance.
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, bindBy, frameFrom, TINY, tiny, onSurface } from './parts.js';
import { hideMaterial } from './materials.js';
import { mergeGeometries } from './sculpt.js';
import { pose, addPose, bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp } from './anim.js';
import { Tracker, Leg, Gait, hairClump, hairMaterial } from './pal-kit.js';
import { glide, puff } from '../sound/calls.js';
import { rand } from '../config.js';

const COAT = 0xf6f0fd;
const MUZZLE = 0xfae6ee;
const INNER_EAR = 0xf2a9c6;
const BLUSH = 0xf59ac0;
const HOOF = 0xd9c7ee;
const LASH = 0x2e1d3a;
const NOSTRIL = 0x5e2a44;
const MOUTH = 0x84395a;
const MANE = [0xf59ad0, 0xc49cf5, 0x9cc4f7, 0xa8ecd6, 0xf7d6a0];

// per-frame constants and scratch (no allocations while animating)
const TROT = [0, 0.5, 0.5, 0];
const TAIL = ['tail0', 'tail1', 'tail2', 'tail3'];
const _step = [0, 0];

const RAINBOW = [[1.9, 0.55, 0.6], [1.9, 1.15, 0.45], [1.8, 1.7, 0.55], [0.65, 1.8, 0.8], [0.55, 1.15, 1.95], [1.35, 0.7, 1.95]];

// the head is modelled about its pivot and scaled up, foal-like
const HP = [0, 0.27, 0.083];
const HS = 1.14;
const H = (x, y, z) => [HP[0] + x * HS, HP[1] + y * HS, HP[2] + z * HS];
const hr = (r) => r * HS;
const HORN_BASE = H(0, 0.068, 0.028);
const HORN_TIP = H(0, 0.128, 0.064);
const EYE = H(0.034, 0.024, 0.04);
const EYE_DIR = [0.46, 0.06, 0.885];
const EYE_R = hr(0.0218);
const EYE_PARTS = [['eyeL', 'lidL', 'shutL'], ['eyeR', 'lidR', 'shutR']];
const SHUT = ['shutL', 'shutR'];
const LID_K = 0.965; // how much closer to the eye than usual the lid lies
const rel = (p) => [p[0] - HP[0], p[1] - HP[1], p[2] - HP[2]]; // offset from the head bone

// a spiral horn: a cone along base -> tip with a twisted two-start groove
function spiralHorn(base, tip, r0, { turns = 3.4, radial = 30, steps = 64, depth = 0.2 } = {}) {
  const A = new THREE.Vector3(...base);
  const Bt = new THREE.Vector3(...tip);
  const axis = Bt.clone().sub(A);
  const L = axis.length();
  const f = frameFrom(axis.toArray(), [0, 0, -1]);
  const pos = [];
  const idx = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const r = r0 * Math.pow(1 - t, 0.8) + 0.0006;
    for (let a = 0; a <= radial; a++) {
      const th = (a / radial) * TAU;
      const g = Math.pow(0.5 + 0.5 * Math.cos(2 * (th - TAU * turns * t)), 2.5);
      const rr = r * (1 - depth * g * smooth(t * 8) * (1 - t * 0.5));
      const c = Math.cos(th) * rr, sn = Math.sin(th) * rr;
      pos.push(A.x + axis.x * t + f.x.x * c + f.y.x * sn, A.y + axis.y * t + f.x.y * c + f.y.y * sn, A.z + axis.z * t + f.x.z * c + f.y.z * sn);
    }
  }
  const row = radial + 1;
  for (let s = 0; s < steps; s++)
    for (let a = 0; a < radial; a++) {
      const i0 = s * row + a;
      idx.push(i0, i0 + 1, i0 + row, i0 + 1, i0 + row + 1, i0 + row);
    }
  // round tip
  const tipI = pos.length / 3;
  pos.push(Bt.x + (axis.x / L) * 0.0006, Bt.y + (axis.y / L) * 0.0006, Bt.z + (axis.z / L) * 0.0006);
  for (let a = 0; a < radial; a++) idx.push(steps * row + a, steps * row + a + 1, tipI);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a torus round the axis n, its centre `depth` out from c along n (a soft rim of fur round an eye)
function ring(s, c, n, depth, R, r, o) {
  const y = new THREE.Vector3(...n).normalize();
  const x = new THREE.Vector3(1, 0, 0);
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'XYZ');
  s.torus(new THREE.Vector3(...c).addScaledVector(y, depth).toArray(), R, r, { ...o, rot: [e.x, e.y, e.z] });
}

export class Unicorn extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.furry = true;
    this.hideOpts = { sheen: 0.8, clearcoat: 0.6 };
    this.shared.uFurLen.value = 0.0055;
    this.shared.uStrand.value = 0.0016;
    this.shared.uComb.value.set(0, -0.35, -0.55);
    this.shared.uSplat.value = 0.2;
    this.walkSpeed = 0.26;
    this.turnRate = 2.2;
    this.hopScale = 0.9;
    this.sparkleColors = RAINBOW;
    this.phase = 0;
    this.track = new Tracker();
    this.headYaw = new Spring(0, 1.5, 0.75);
    this.headPitch = new Spring(0, 1.5, 0.75);
    this.tailSway = [0, 1, 2, 3].map((i) => new Spring(0, 1.9 - i * 0.25, 0.32));
    this.tailLift = [0, 1, 2, 3].map((i) => new Spring(0, 1.7 - i * 0.2, 0.4));
    this.maneSide = [0, 1, 2].map(() => new Spring(0, 2.2, 0.3));
    this.maneBack = [0, 1, 2].map(() => new Spring(0, 2.0, 0.35));
    this.earL = new Spring(0, 3.5, 0.35);
    this.earR = new Spring(0, 3.5, 0.35);
    this.earTimer = 2;
    this.swishTimer = 3;
    this.swish = new Spring(0, 1.1, 0.25);
    this.pawTimer = 6;
    this.idleFade = 1; // idle fidgets fade out when a trick or a walk starts
    this.pawT = -1;
    this.pawSide = 1;
    this.prevBob = 0;
    // how shut the eyes are (0..1), so closed eyes can sink in a little
    this.shut = 0;
    const blink = this.blinker.update.bind(this.blinker);
    this.blinker.update = (dt) => (this.shut = blink(dt));
  }

  get tricks() {
    return ['rear', 'spin', 'gallop'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0.158, 0]);
    s.bone('hips', 'root', [0, 0.162, -0.04]);
    s.bone('chest', 'root', [0, 0.162, 0.04]);
    s.bone('neck', 'chest', [0, 0.2, 0.058]);
    s.bone('head', 'neck', HP);
    s.bone('jaw', 'head', H(0, -0.02, 0.038));
    this.eyeBones(s, EYE);
    // the line a shut eye makes, shown only while the lids are down
    s.bones2('shut', 'head', EYE);
    s.bones2('ear', 'head', H(0.03, 0.058, -0.014));
    s.bone('maneH', 'head', H(0, 0.07, -0.024));
    s.bone('maneN', 'neck', [0, 0.28, 0.036]);
    s.bone('maneW', 'chest', [0, 0.222, 0.004]);
    s.bone('tail0', 'hips', [0, 0.19, -0.094]);
    s.bone('tail1', 'tail0', [0, 0.19, -0.13]);
    s.bone('tail2', 'tail1', [0, 0.14, -0.158]);
    s.bone('tail3', 'tail2', [0, 0.085, -0.166]);
    s.bones2('shoulder', 'chest', [0.03, 0.14, 0.048]);
    s.bones2('elbow', 'shoulder', [0.03, 0.074, 0.052]);
    s.bones2('paw', 'elbow', [0.03, 0.024, 0.051]);
    s.bones2('thigh', 'hips', [0.033, 0.145, -0.05]);
    s.bones2('knee', 'thigh', [0.033, 0.076, -0.064]);
    s.bones2('foot', 'knee', [0.033, 0.024, -0.056]);

    const coat = { paint: 1, fur: 1, rough: 0.72, pat: 0, tint: COAT };
    const muzzle = { paint: 0.35, fur: 0.3, rough: 0.55, tint: MUZZLE };
    s.setLook(coat);
    // body: a short round barrel, chest and rump
    s.ellipsoid([0, 0.166, 0.036], [0.049, 0.052, 0.056], { bone: 'chest', k: 0.03 });
    s.ellipsoid([0, 0.17, -0.036], [0.052, 0.054, 0.056], { bone: 'hips', k: 0.05 });
    s.ellipsoid([0, 0.153, 0.0], [0.046, 0.044, 0.062], { bone: 'root', k: 0.04, tint: 0xfbf5ff, paint: 0.9 });
    // neck: short, thick and arched
    s.cone([0, 0.18, 0.046], [0, 0.262, 0.074], 0.037, 0.031, { bone: 'neck', k: 0.035 });
    s.ellipsoid([0, 0.24, 0.044], [0.022, 0.038, 0.024], { bone: 'neck', k: 0.03, rot: [0.5, 0, 0] });
    // a soft crest of long mane fur along the top of the neck, under the locks
    const crestLook = { tint: MANE[1], paint: 0.6, fur: 2.4, rough: 0.6 };
    s.ellipsoid(H(0, 0.066, -0.03), [0.013, 0.014, 0.02], { bone: 'head', k: 0.012, ...crestLook });
    s.cone([0, 0.318, 0.046], [0, 0.262, 0.036], 0.0115, 0.011, { bone: 'neck', k: 0.012, ...crestLook });
    s.cone([0, 0.262, 0.036], [0, 0.212, 0.006], 0.011, 0.0095, { bone: 'chest', k: 0.012, ...crestLook });
    s.ellipsoid(H(0, 0.066, 0.004), [hr(0.017), hr(0.011), hr(0.016)], { bone: 'head', k: 0.014, ...crestLook, fur: 2.6 });
    // head: a big round cranium, soft cheeks and a short, rounded velvet muzzle
    s.ellipsoid(H(0, 0.027, 0.004), [hr(0.06), hr(0.055), hr(0.055)], { bone: 'head', k: 0.03 });
    s.sphere(H(0.027, -0.003, 0.022), hr(0.022), { bone: 'head', k: 0.03, sym: true });
    s.ellipsoid(H(0, -0.013, 0.048), [hr(0.028), hr(0.022), hr(0.025)], { bone: 'head', k: 0.035, rot: [0.2, 0, 0], ...muzzle, paint: 0.6, fur: 0.7 });
    s.ellipsoid(H(0, -0.016, 0.06), [hr(0.02), hr(0.016), hr(0.015)], { bone: 'head', k: 0.02, ...muzzle, paint: 0.6, fur: 0.7 });
    // a rosy blush under each eye
    s.sphere(H(0.04, -0.009, 0.038), hr(0.012), { bone: 'head', k: 0.012, sym: true, tint: BLUSH, paint: 0.45, fur: 0.6 });
    // chin, on the jaw
    s.ellipsoid(H(0, -0.028, 0.048), [hr(0.014), hr(0.009), hr(0.017)], { bone: 'jaw', k: 0.014, ...muzzle, paint: 0.6, fur: 0.7 });
    // eye sockets: smooth, short fur inside a soft rim that holds each eye
    s.sphere(EYE, EYE_R * 0.86, { bone: 'head', k: 0.006, sym: true, fur: 0.15 });
    ring(s, EYE, EYE_DIR, EYE_R * 0.46, EYE_R * 0.95, 0.0024, { bone: 'head', k: 0.007, sym: true, fur: 0.35 });
    // ears: soft leaves with pink hollows
    s.ellipsoid(H(0.034, 0.08, -0.014), [hr(0.013), hr(0.027), hr(0.0095)], { bone: 'earL', k: 0.012, sym: true, rot: [0.1, 0, -0.32] });
    s.ellipsoid(H(0.036, 0.083, -0.006), [hr(0.008), hr(0.02), hr(0.0065)], { bone: 'earL', k: 0.006, sym: true, rot: [0.1, 0, -0.32], sub: true, tint: INNER_EAR, paint: 0.12, fur: 0.35 });
    // front legs: a soft forearm, knobbly knee, slim cannon, fluffy fetlock
    s.ellipsoid([0.031, 0.118, 0.047], [0.021, 0.034, 0.024], { bone: 'shoulderL', k: 0.03, sym: true });
    s.cone([0.03, 0.11, 0.049], [0.03, 0.074, 0.052], 0.0165, 0.0128, { bone: 'shoulderL', k: 0.012, sym: true });
    s.sphere([0.03, 0.074, 0.052], 0.0132, { bone: 'elbowL', k: 0.01, sym: true });
    s.cone([0.03, 0.074, 0.052], [0.03, 0.03, 0.051], 0.0114, 0.0104, { bone: 'elbowL', k: 0.008, sym: true });
    s.ellipsoid([0.03, 0.03, 0.051], [0.0136, 0.0125, 0.014], { bone: 'pawL', k: 0.008, sym: true, fur: 1.5 });
    // hind legs: a round haunch, gaskin, hock, cannon, fetlock
    s.ellipsoid([0.034, 0.15, -0.046], [0.027, 0.048, 0.04], { bone: 'thighL', k: 0.04, sym: true });
    s.cone([0.034, 0.118, -0.058], [0.033, 0.076, -0.066], 0.019, 0.0132, { bone: 'thighL', k: 0.015, sym: true });
    s.sphere([0.033, 0.076, -0.066], 0.0134, { bone: 'kneeL', k: 0.01, sym: true });
    s.cone([0.033, 0.076, -0.066], [0.033, 0.03, -0.056], 0.0114, 0.0104, { bone: 'kneeL', k: 0.008, sym: true });
    s.ellipsoid([0.033, 0.03, -0.056], [0.0136, 0.0125, 0.014], { bone: 'footL', k: 0.008, sym: true, fur: 1.5 });
    // tail dock
    s.cone([0, 0.192, -0.084], [0, 0.19, -0.108], 0.015, 0.011, { bone: 'tail0', k: 0.02 });
  }

  parts(s) {
    const I = s.index;
    const geo = this.body.geometry;
    this.addEyes(s, {
      c: EYE,
      r: EYE_R,
      dir: EYE_DIR,
      iris: 0x9a5ee0,
      iris2: 0x3aa0d8,
      irisSize: 0.95,
      pupil: 0.46,
      glint: 1.5,
      lid: { tint: COAT, paint: 1, fur: 1, rough: 0.8, open: -0.6, closed: 1.5 },
    });
    // soft velvet lids: no gloss, just a little sheen
    const lidMat = hideMaterial(this.shared, { furry: true, sheen: 0.35, clearcoat: 0 });
    // (and hugging the eye a little closer than the default, so a shut eye is a neat soft lid)
    let side0 = 1;
    for (const m of this.meshes)
      if (m !== this.body && m.material === this.hide) {
        m.material = lidMat;
        m.geometry.translate(-EYE[0] * side0, -EYE[1], -EYE[2]).scale(LID_K, LID_K, LID_K).translate(EYE[0] * side0, EYE[1], EYE[2]);
        side0 = -side0;
      }

    // a fine dark line along each upper lid's rim and a fan of long lashes
    // curling up and out at the outer corner (they ride on the lid)
    const lashes = [];
    for (const side of [1, -1]) {
      const cc = [EYE[0] * side, EYE[1], EYE[2]];
      const fr = frameFrom([EYE_DIR[0] * side, EYE_DIR[1], EYE_DIR[2]]);
      const toRest = ([x, y, z]) => [cc[0] + fr.x.x * x + fr.y.x * y + fr.z.x * z, cc[1] + fr.x.y * x + fr.y.y * y + fr.z.y * z, cc[2] + fr.x.z * x + fr.y.z * y + fr.z.z * z];
      const R = EYE_R * 1.07 * LID_K * 1.012;
      const tilt = -0.35; // as the lid is tipped back (see lidGeometry)
      const outer = side > 0 ? 0 : Math.PI;
      const dir = side > 0 ? 1 : -1;
      const rim = (phi, out = 0, up = 0) => {
        const x = (R + out) * Math.cos(phi), z = (R + out) * Math.sin(phi);
        return toRest([x, up * Math.cos(tilt) - z * Math.sin(tilt), up * Math.sin(tilt) + z * Math.cos(tilt)]);
      };
      const lid = I['lid' + (side > 0 ? 'L' : 'R')];
      const pts = [];
      for (let i = 0; i <= 20; i++) pts.push(rim(outer + dir * lerp(0.05, Math.PI - 0.75, i / 20)));
      lashes.push(bindTo(tubeGeometry(pts, [0.0005, 0.0011, 0.0013, 0.0011, 0.0008, 0.0004], { radial: 6, steps: 40 }), lid));
      for (const [a, len] of [[0.1, 0.0125], [0.3, 0.0135], [0.52, 0.012], [0.76, 0.0095], [1.0, 0.0075]]) {
        const phi = outer + dir * a;
        const lp = [0, 0.33, 0.66, 1].map((k) => rim(phi, len * k * 0.85, len * (k * 0.3 + k * k * 0.7)));
        lashes.push(bindTo(tubeGeometry(lp, [0.0007, 0.0005, 0.0003], { radial: 5, steps: 8 }), lid));
      }
    }
    this.addMesh(mergeGeometries(lashes.map((g) => withLook(g, { tint: LASH, rough: 0.4 }))), this.mat('solid', { clearcoat: 0.3 }), { shadow: false }).userData.noProject = true;

    // the line a shut eye makes: a soft curve with a few short lashes, drawn on the shut lid
    const shutLines = [];
    for (const side of [1, -1]) {
      const cc = [EYE[0] * side, EYE[1], EYE[2]];
      const fr = frameFrom([EYE_DIR[0] * side, EYE_DIR[1], EYE_DIR[2]]);
      const toRest = ([x, y, z]) => [cc[0] + fr.x.x * x + fr.y.x * y + fr.z.x * z, cc[1] + fr.x.y * x + fr.y.y * y + fr.z.y * z, cc[2] + fr.x.z * x + fr.y.z * y + fr.z.z * z];
      const Rs = EYE_R * 1.07 * LID_K * 1.03;
      const onLid = (u, dy = 0, out = 0) => {
        const x = -u * 0.8 * Rs * side;
        const y = (-0.1 - 0.22 * (1 - u * u) + dy) * Rs;
        const r = Rs + out;
        return toRest([x, y, Math.sqrt(Math.max(0, r * r - x * x - y * y))]);
      };
      const cp = [];
      for (let i = 0; i <= 16; i++) cp.push(onLid(-1 + (2 * i) / 16));
      const B = I['shut' + (side > 0 ? 'L' : 'R')];
      shutLines.push(bindTo(tiny(tubeGeometry(cp, [0.0006, 0.0012, 0.0014, 0.0012, 0.0009, 0.0005], { radial: 6, steps: 32 }), cc), B));
      for (const [u, len] of [[-0.95, 0.009], [-0.8, 0.0085], [-0.64, 0.0065]]) {
        const lp = [0, 0.5, 1].map((k) => onLid(u - k * 0.22, -k * len * 9, k * len * 0.5));
        shutLines.push(bindTo(tiny(tubeGeometry(lp, [0.0006, 0.0004, 0.0002], { radial: 5, steps: 6 }), cc), B));
      }
    }
    this.addMesh(mergeGeometries(shutLines.map((g) => withLook(g, { tint: LASH, rough: 0.4 }))), this.mat('solid', { clearcoat: 0.3 }), { shadow: false }).userData.noProject = true;

    // the smile: a small curve under the nose, on the muzzle
    const on = (p) => onSurface(geo, H(...p), 0.0009).p;
    const smile = [tubeGeometry([[0, -0.0195, 0.0715], [0, -0.0235, 0.0705], [0, -0.0275, 0.0685]].map(on), [0.0013, 0.0013, 0.0012], { radial: 6, steps: 8 })];
    for (const sd of [1, -1])
      smile.push(tubeGeometry([[0, -0.0275, 0.0685], [0.007 * sd, -0.0292, 0.0655], [0.0145 * sd, -0.0275, 0.0595], [0.0195 * sd, -0.0225, 0.0525]].map(on), [0.0012, 0.0012, 0.001, 0.0006], { radial: 6, steps: 14 }));
    this.addMesh(bindTo(mergeGeometries(smile.map((g) => withLook(g, { tint: MOUTH, rough: 0.5 }))), I.head), this.mat('solid'), { shadow: false }).userData.noProject = true;
    // two small soft nostrils, dark rosy ovals lying on the tip of the muzzle
    const nostrils = [1, -1].map((sd) => {
      const { p, n } = onSurface(geo, H(0.0085 * sd, -0.0125, 0.0735), 0.0);
      const g = new THREE.SphereGeometry(1, 14, 10);
      g.scale(hr(0.0027), hr(0.0038), hr(0.0011));
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n)), new THREE.Vector3(1, 1, 1)));
      g.deleteAttribute('uv');
      return withLook(g, { tint: NOSTRIL, rough: 0.5 });
    });
    this.addMesh(bindTo(mergeGeometries(nostrils), I.head), this.mat('solid', { clearcoat: 0.3 }), { shadow: false }).userData.noProject = true;

    // the horn: a pearly spiral that shimmers with rainbow colours, a touch of gold at its base
    const horn = spiralHorn(HORN_BASE, HORN_TIP, 0.0112);
    withLook(horn, { tint: 0xfff4e4, paint: 0.12, rough: 0.18 });
    const hp = horn.attributes.position;
    const ht = horn.attributes.aTint;
    const c = new THREE.Color();
    for (let i = 0; i < hp.count; i++) {
      const k = clamp((hp.getY(i) - HORN_BASE[1]) / (HORN_TIP[1] - HORN_BASE[1]), 0, 1);
      c.setRGB(lerp(1.0, 0.97, k), lerp(0.8, 0.94, k), lerp(0.52, 1.0, k));
      ht.setXYZ(i, c.r, c.g, c.b);
    }
    const hornMat = this.mat('solid', { clearcoat: 1, iridescence: 1 });
    hornMat.iridescenceIOR = 1.9;
    hornMat.iridescenceThicknessRange = [300, 700];
    hornMat.sheen = 0.6;
    hornMat.sheenColor = new THREE.Color(1, 0.8, 0.95);
    this.addMesh(bindTo(horn, I.head), hornMat);

    // hooves: glossy little cups
    const hoofMat = this.mat('solid', { clearcoat: 1 });
    const hooves = [];
    for (const [x, z, bone] of [[0.03, 0.051, 'paw'], [0.033, -0.056, 'foot']])
      for (const side of [1, -1]) {
        const prof = [[0, 0], [0.0125, 0], [0.0142, 0.0012], [0.0147, 0.004], [0.0138, 0.012], [0.0125, 0.019], [0.0118, 0.0215], [0.0, 0.0225]].map(([r, y]) => new THREE.Vector2(r, y));
        const g = new THREE.LatheGeometry(prof, 22);
        g.scale(1, 1, 1.08).translate(x * side, 0, z + 0.001);
        g.deleteAttribute('uv');
        withLook(g, { tint: HOOF, paint: 0.2, rough: 0.2 });
        bindTo(g, I[bone + (side > 0 ? 'L' : 'R')]);
        hooves.push(g);
      }
    this.addMesh(mergeGeometries(hooves), hoofMat);

    const hairMat = hairMaterial(this, { sheen: 0.45, strands: 0.6, key: 'unicorn' });
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const lockLook = (i) => ({ tint: new THREE.Color(MANE[i % MANE.length]), paint: 0.6, rough: 0.32 });

    // the mane: locks along the crest, falling to both sides, and a forelock
    const CREST = [H(0, 0.074, -0.028), [0, 0.318, 0.046], [0, 0.28, 0.038], [0, 0.242, 0.026], [0, 0.21, 0.006]];
    const crest = (u) => {
      const seg = u * (CREST.length - 1);
      const i = Math.min(CREST.length - 2, Math.floor(seg));
      const k = seg - i;
      return [0, lerp(CREST[i][1], CREST[i + 1][1], k), lerp(CREST[i][2], CREST[i + 1][2], k)];
    };
    const maneLocks = [];
    const nL = 24;
    const addLock = (u, side, long, sub) => {
      const R = crest(u);
      const L = (0.055 + 0.045 * Math.sin(u * Math.PI * 0.85 + 0.25) + rnd() * 0.016) * long;
      // how far out the neck's side is here (wider behind the head)
      const out = lerp(0.05, 0.043, u) + 0.004 * rnd() + sub * 0.004;
      const wv = (rnd() - 0.5) * 0.016;
      const dz = (rnd() - 0.5) * 0.006;
      const pts = [
        [0, R[1] - 0.008, R[2] + 0.002 + dz],
        [side * 0.012, R[1] + 0.009 - sub * 0.004, R[2] + dz],
        [side * out * 0.82, R[1] + 0.004 - sub * 0.006, R[2] + 0.003 + dz],
        [side * out, R[1] - L * 0.35, R[2] + 0.008 + wv],
        [side * (out + 0.002), R[1] - L * 0.7, R[2] + 0.01 - wv],
        [side * (out + 0.01), R[1] - L, R[2] + 0.004 + wv * 1.5],
      ];
      const g = hairClump(pts, 0.019 + rnd() * 0.006, 0.0085, { side: [side, 0.15, 0], seed: rnd(), steps: 20, swell: 0.35 });
      withLook(g, lockLook(Math.floor(u * 9) + (side > 0 ? 2 : 0) + sub));
      const root = u < 0.3 ? I.head : u < 0.75 ? I.neck : I.chest;
      const tipB = u < 0.3 ? I.maneH : u < 0.7 ? I.maneN : I.maneW;
      const sp = g.attributes.aSpan;
      bindBy(g, (x, y, z, j) => {
        const k = smooth((sp.getX(j) - 0.1) / 0.7);
        return [[root, 1 - k], [tipB, k]];
      });
      maneLocks.push(g);
    };
    // most of it falls to her right (the side painted on the canvas), a
    // shorter, fluffy layer to the left
    for (let i = 0; i < nL; i++) addLock(i / (nL - 1), -1, 1, i % 2);
    for (let i = 0; i < 14; i++) addLock(i / 13, 1, 0.55, 0);
    // forelock: a few slim, silky locks swept from the topknot down over her
    // right brow, lying on the head and curling away at their tips
    for (let j = 0; j < 5; j++) {
      const o = j * 0.0055;
      const guess = [
        [-0.001 - o * 0.3, 0.085, 0.004 + o * 0.4],
        [-0.008 - o, 0.082, 0.017 + o * 0.4],
        [-0.02 - o * 1.3, 0.076, 0.031 + o * 0.3],
        [-0.032 - o * 1.3, 0.067, 0.042],
        [-0.038 - o * 1.1, 0.058 - o * 0.5, 0.046 + o * 0.4],
      ];
      const lift = [0.004, 0.0065, 0.007, 0.008, 0.013];
      const pts = guess.map((q, i) => onSurface(geo, H(...q), lift[i]).p);
      const mid = new THREE.Vector3(...pts[2]).sub(new THREE.Vector3(...H(0, 0.027, 0.004))).normalize();
      const dirV = new THREE.Vector3(...pts[4]).sub(new THREE.Vector3(...pts[0]));
      const sideV = new THREE.Vector3().crossVectors(dirV, mid).normalize();
      const g = hairClump(pts, 0.0085, 0.0038, { side: sideV.toArray(), seed: rnd(), steps: 16, swell: 0.3, tip: 0.9 });
      withLook(g, lockLook(j + 1));
      const sp = g.attributes.aSpan;
      bindBy(g, (x, y, z, k2) => {
        const k = smooth((sp.getX(k2) - 0.2) / 0.8) * 0.6;
        return [[I.head, 1 - k], [I.maneH, k]];
      });
      maneLocks.push(g);
    }
    this.addMesh(mergeGeometries(maneLocks), hairMat);

    // the tail: a full tail of locks that arcs up from the dock and falls in a wave
    const tailLocks = [];
    const tb = [I.tail0, I.tail1, I.tail2, I.tail3];
    const nT = 22;
    for (let i = 0; i < nT; i++) {
      const a = (i / nT) * TAU + rnd() * 0.3;
      const sx = Math.cos(a), sy = Math.sin(a);
      const L = 0.1 + rnd() * 0.055;
      const sp0 = 0.01 + rnd() * 0.006;
      const w = (rnd() - 0.5) * 0.02;
      const w2 = (rnd() - 0.5) * 0.016;
      const back = rnd() * 0.02;
      const curl = (rnd() - 0.3) * 0.02;
      const pts = [
        [sx * 0.004, 0.19 + sy * 0.004, -0.098],
        [sx * sp0, 0.2 + sy * 0.008 - rnd() * 0.006, -0.125 - back * 0.3],
        [sx * 0.02, 0.185 + sy * 0.008, -0.15 - back * 0.6],
        [sx * 0.022 + w, 0.19 - L * 0.55, -0.168 + sy * 0.01 - back],
        [sx * 0.016 - w * 0.5 + w2, 0.19 - L * 0.85, -0.162 + sy * 0.012 - back * 0.6],
        [sx * 0.024 + w2, 0.19 - L * 1.03, -0.15 + sy * 0.014 + curl],
        [sx * 0.03 + w2 * 1.5, 0.19 - L * 1.1, -0.136 + sy * 0.014 + curl * 1.6],
      ];
      const g = hairClump(pts, 0.019 + rnd() * 0.005, 0.007, { side: [sx, sy * 0.3, 0.001], seed: rnd(), steps: 24 });
      withLook(g, lockLook(i));
      const sp = g.attributes.aSpan;
      bindBy(g, (x, y, z, j) => {
        const f = clamp(sp.getX(j) * 1.05, 0, 1) * 3;
        const k = Math.min(2, Math.floor(f));
        const ww = f - k;
        return [[tb[k], 1 - ww], [tb[k + 1], ww]];
      });
      tailLocks.push(g);
    }
    this.addMesh(mergeGeometries(tailLocks), hairMat);
  }

  // ------------------------------------------------------------ motion

  // after the eyes and lids are posed: closed eyes sink in and show the line
  // a shut eye makes, so a blink is a neat soft lid and not a ball
  poseEyes(dt, camera) {
    super.poseEyes(dt, camera);
    const k = smooth((this.shut - 0.75) / 0.2);
    const sink = smooth(this.shut) * EYE_R * 0.2;
    const d = (this._eyeDir ??= new THREE.Vector3(...EYE_DIR).normalize());
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? 1 : -1;
      for (const n of EYE_PARTS[i]) {
        const q = this.bones[n].position;
        q.x -= d.x * sx * sink;
        q.y -= d.y * sink;
        q.z -= d.z * sink;
      }
      this.bones[SHUT[i]].scale.setScalar(Math.max(1e-4, k) / TINY);
    }
  }

  makeLegs() {
    return [
      new Leg(this, 'shoulderL', 'elbowL', 'pawL', 1),
      new Leg(this, 'shoulderR', 'elbowR', 'pawR', 1),
      new Leg(this, 'thighL', 'kneeL', 'footL', -1),
      new Leg(this, 'thighR', 'kneeR', 'footR', -1),
    ];
  }

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    this.legs ??= this.makeLegs();
    const tr = this.track.update(this.object, dt);
    const speed = m.speed;
    const air = m.air;
    const moving = clamp(speed / 0.16, 0, 1) * (1 - air);
    const freq = lerp(1.4, 2.0, clamp(speed / 0.26, 0, 1)) * 0.8; // (a slower cadence with longer strides steps more smoothly)
    this.phase += dt * freq;
    const ph = this.phase;
    const duty = 0.52;
    const breathe = Math.sin(t * 1.9);
    const gait = (this.gait ??= new Gait(4));
    gait.begin(tr, air, dt);

    // a leg state the tricks can change: planted weight, free offsets and toes
    const L = (this.legState ??= [0, 1, 2, 3].map(() => ({ plant: 1, off: new THREE.Vector3(), toe: 0, lift: 0 })));
    for (const l of L) {
      l.plant = 1 - air;
      l.off.set(0, 0, 0);
      l.toe = 0;
      l.lift = 0;
      l.dz = 0;
    }

    // body: breathing, a springy bounce and a sway when prancing, a slow shift of weight standing
    B.chest.scale.set(1 + breathe * 0.01, 1 + breathe * 0.014, 1 + breathe * 0.008);
    const bounce = Math.cos(ph * TAU * 2);
    const bob = (-0.0035 + 0.0035 * bounce) * moving - 0.0015;
    B.root.position.y += bob;
    B.root.position.x += Math.sin(t * 0.45) * 0.0025 * (1 - moving);
    B.root.rotation.z = Math.sin(ph * TAU) * 0.035 * moving + Math.sin(t * 0.45) * 0.018 * (1 - moving);
    B.root.rotation.x = -0.02 * moving + Math.sin(ph * TAU * 2 + 0.6) * 0.02 * moving;
    B.hips.rotation.y = Math.sin(ph * TAU) * 0.05 * moving;

    // head: follows what she looks at, with a curious tilt; a proud arch when prancing
    let yaw = Math.sin(t * 0.33) * 0.3 + Math.sin(t * 0.11) * 0.2;
    let pitch = Math.sin(t * 0.27) * 0.08;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z - 0.1), -0.75, 0.75);
      pitch = clamp(-Math.atan2(this.lookLocal.y - 0.29, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.4, 0.35);
    }
    const hy = this.headYaw.update(yaw * (1 - moving * 0.6), dt);
    const hp = this.headPitch.update(pitch, dt);
    const nod = Math.sin(ph * TAU * 2 - 0.5) * 0.05 * moving;
    pose(B.neck, -0.1 * moving + hp * 0.35 + nod * 0.5 + breathe * 0.01, hy * 0.45, 0);
    pose(B.head, 0.12 * moving + hp * 0.65 + nod, hy * 0.55, Math.sin(t * 0.47) * 0.1 * (1 - moving));
    pose(B.jaw, 0.02 + Math.max(0, Math.sin(t * 0.6)) * 0.02, 0, 0);

    // ears: perk towards what she looks at, flick now and then
    this.earTimer -= dt;
    if (this.earTimer <= 0) {
      this.earTimer = rand(1.5, 5);
      if (Math.random() < 0.5) this.earL.kick(rand(4, 8));
      else this.earR.kick(rand(4, 8));
    }
    const perk = this.lookLocal ? 0.12 : 0;
    const eL = this.earL.update(0, dt);
    const eR = this.earR.update(0, dt);
    pose(B.earL, perk - hp * 0.2 + eL * 0.2, eL * 0.25, -0.08 - eL * 0.15 + hy * 0.1);
    pose(B.earR, perk - hp * 0.2 + eR * 0.2, -eR * 0.25, 0.08 + eR * 0.15 + hy * 0.1);

    // an idle paw at the ground now and then, only while standing about: it
    // fades out quickly (and stays quiet) if a trick or a walk starts
    const idle = moving < 0.05 && air < 0.05 && !this.trick;
    this.idleFade = clamp(this.idleFade + (idle ? dt : -dt) * 6, 0, 1);
    if (idle) {
      this.pawTimer -= dt;
      if (this.pawTimer <= 0 && this.pawT < 0) {
        this.pawT = 0;
        this.pawSide = Math.random() < 0.5 ? 0 : 1;
      }
    }
    if (this.pawT >= 0) {
      this.pawT += dt;
      const k = this.pawT;
      const f = this.idleFade;
      const lift = bump(k, 0, 1.3) * f;
      const scrape = Math.sin(k * TAU * 1.6) * bump(k, 0.15, 1.2) * f;
      const l = L[this.pawSide];
      l.off.set(0, 0.018 * lift + Math.max(0, scrape) * 0.008, 0.012 * scrape);
      l.plant = Math.min(l.plant, 1 - lift);
      l.toe = 0.8 * lift;
      addPose(B.head, 0.12 * lift, 0, 0);
      if (!this.pawSound && k > 0.5) {
        this.pawSound = true;
        if (idle) this.emit('sound', { name: 'paw' });
      }
      if (k > 1.3 || f <= 0) {
        this.pawT = -1;
        this.pawSound = false;
        this.pawTimer = rand(7, 14);
      }
    }

    // gait: a prancing trot, diagonal pairs together, knees lifted high
    for (let i = 0; i < 4; i++) {
      gait.step(i, ph + TROT[i], duty, freq, 0.03 * moving * (i < 2 ? 1.2 : 0.8), 0.02, _step);
      L[i].dz = _step[0];
      L[i].lift = _step[1];
      L[i].toe += (i < 2 ? 1.1 : 0.6) * (_step[1] / 0.036);
    }

    // in the air: front legs tucked, hind legs trailing, head reaching
    if (air > 0) {
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        L[i].off.set(0, front ? 0.045 * air : 0.02 * air, front ? -0.005 * air : -0.03 * air);
        L[i].toe += (front ? 1.2 : 0.5) * air;
      }
      addPose(B.neck, -0.25 * air, 0, 0);
      addPose(B.head, 0.1 * air, 0, 0);
    }

    this.tailUp = 0;
    if (this.trick) this.trickPose(this.trick, dt, L);

    // legs: planted with IK
    for (let i = 0; i < 4; i++) {
      const leg = this.legs[i];
      const l = L[i];
      const tg = (this._tg ??= new THREE.Vector3());
      tg.copy(leg.foot);
      tg.z += l.dz;
      tg.y += l.lift;
      leg.solve(tg, l.plant, l.off, l.toe);
    }

    // mane and tail: springs that lag behind the body's movement
    const fwd = clamp(tr.vel.z, -1, 1);
    const side = clamp(-tr.acc.x * 0.04 + tr.yawRate * 0.18, -0.6, 0.6);
    const bobV = (bob - this.prevBob) / Math.max(dt, 1e-3);
    this.prevBob = bob;
    this.swishTimer -= dt;
    if (this.swishTimer <= 0) {
      this.swishTimer = rand(2.5, 6);
      this.swish.kick(rand(-5, 5));
    }
    const sw = this.swish.update(0, dt);
    let prev = side + sw * 0.35 - hy * 0.2 + Math.sin(t * 1.1) * 0.05;
    let prevL = fwd * 1.3 + clamp(tr.acc.z * -0.05, -0.3, 0.3) + (this.tailUp || 0) + clamp(-bobV * 3, -0.3, 0.3);
    for (let i = 0; i < 4; i++) {
      const a = this.tailSway[i].update(prev, dt);
      const b = this.tailLift[i].update(prevL * (i === 0 ? 1 : 0.35), dt);
      pose(B[TAIL[i]], -0.08 + b * (i === 0 ? 0.6 : 0.3), a * 0.25, a * (0.3 + i * 0.1));
      prev = a;
      prevL = b;
    }
    const mh = (this._mane ??= [B.maneH, B.maneN, B.maneW]);
    for (let i = 0; i < 3; i++) {
      const ms = this.maneSide[i].update(side * 0.6 - hy * 0.3 * (i === 0 ? 1 : 0.4), dt);
      const mb = this.maneBack[i].update(clamp(-bobV * 4, -0.5, 0.5) + fwd * 0.6 + (i === 0 ? hp * 0.3 : 0), dt);
      pose(mh[i], mb * 0.4, 0, ms * 0.35);
    }
  }

  // pitch the whole body by ang (negative: nose up) about the ground at z = pz
  rearAbout(ang, pz) {
    const root = this.bones.root;
    const dy = 0.158; // the root's rest height
    const dz = -pz;
    root.position.y += dy * Math.cos(ang) - dz * Math.sin(ang) - dy;
    root.position.z += dy * Math.sin(ang) + dz * Math.cos(ang) - dz;
    root.rotation.x += ang;
  }

  trickPose(tr, dt, L) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'rear') {
      // anticipation: sink back onto the haunches; rear up, paw the air,
      // horn sparkles; come down with a bounce and a toss of the mane
      const sink = bump(t, 0.0, 0.62);
      const up = ramp(t, 0.42, 0.85) * (1 - ramp(t, 1.65, 2.0));
      const land = wobble(t - 2.0, 2.4, 0.7);
      B.root.position.y += -0.012 * sink - Math.abs(land) * 0.006;
      addPose(B.root, 0.06 * sink, 0, 0);
      this.rearAbout(-0.72 * up, -0.056);
      addPose(B.neck, -0.15 * sink + 0.35 * up - 0.2 * bump(t, 1.95, 2.5), 0, 0);
      addPose(B.head, 0.1 * sink - 0.25 * up + Math.sin(t * 9) * 0.05 * bump(t, 2.0, 2.6), Math.sin(t * 7) * 0.08 * up, 0);
      addPose(B.jaw, 0.25 * bump(t, 0.5, 1.4), 0, 0);
      const pawing = up;
      for (let i = 0; i < 2; i++) {
        const p = Math.sin(t * 11 + i * Math.PI);
        L[i].plant = 1 - up;
        L[i].off.set(0, 0.03 * pawing + p * 0.012 * pawing, 0.02 * pawing + p * 0.012 * pawing);
        L[i].toe += 1.1 * pawing;
      }
      // hind legs bend a touch to carry her
      for (let i = 2; i < 4; i++) L[i].dz += 0.008 * up;
      this.tailUp = -0.6 * up;
      if (!tr.s1 && t > 0.5) {
        tr.s1 = true;
        this.emit('sound', { name: 'rear' });
      }
      if (!tr.s2 && t > 0.95) {
        tr.s2 = true;
        const tip = this.bonePoint('head', rel(HORN_TIP));
        const dir = this.bonePoint('head', [0, rel(HORN_TIP)[1] + 0.25, rel(HORN_TIP)[2] + 0.2]);
        this.emit('puff', { at: tip, dir, colors: RAINBOW, count: 110, speed: 1.2, push: 1.1 });
        this.emit('sparkle', { at: tip, count: 40, colors: [[2, 1.8, 1.4], [1.6, 1.2, 2]], speed: 0.5, up: 0.6, size: 0.02 });
        this.emit('sound', { name: 'sparkle' });
      }
      if (!tr.landed && t > 2.0) {
        tr.landed = true;
        this.emit('land', { at: this.bonePoint('chest', [0, -0.13, 0.03]) });
      }
    } else if (tr.name === 'spin') {
      // crouch, hop up and twirl round in a ring of rainbow sparkles, land
      const crouch = bump(t, 0, 0.42);
      const upK = ramp(t, 0.32, 0.62) * (1 - ramp(t, 1.45, 1.75));
      const land = wobble(t - 1.75, 2.6, 0.6);
      const hop = upK * (0.075 + Math.sin(t * 6) * 0.006);
      B.root.position.y += -0.014 * crouch + hop - Math.abs(land) * 0.008;
      B.root.scale.set(1 + crouch * 0.04, 1 - crouch * 0.05 + upK * 0.03, 1 + crouch * 0.03);
      B.root.rotation.y += smooth((t - 0.45) / 1.2) * TAU;
      addPose(B.neck, -0.2 * upK + 0.1 * crouch, 0, 0);
      addPose(B.head, 0.15 * upK, 0, 0.15 * upK);
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        L[i].plant = 1 - upK;
        L[i].off.set(0, (front ? 0.04 : 0.028) * upK, (front ? 0.0 : -0.01) * upK);
        L[i].toe += (front ? 1.1 : 0.6) * upK;
      }
      this.tailUp = 0.3 * upK;
      tr.next ??= 0.5;
      if (t > tr.next && t < 1.6) {
        tr.next += 0.09;
        const k = Math.floor(t * 11) % RAINBOW.length;
        const tip = this.bonePoint('head', rel(HORN_TIP));
        this.emit('sparkle', { at: tip, count: 10, colors: [RAINBOW[k], RAINBOW[(k + 1) % RAINBOW.length]], speed: 0.35, up: 0.25, size: 0.017, life: 1.4 });
        const tail = this.bonePoint('tail3', [0, -0.02, 0]);
        this.emit('sparkle', { at: tail, count: 6, colors: [RAINBOW[(k + 3) % RAINBOW.length]], speed: 0.3, up: 0.3, size: 0.015, life: 1.2 });
      }
      if (!tr.s1 && t > 0.35) {
        tr.s1 = true;
        this.emit('sound', { name: 'spin' });
      }
      if (!tr.landed && t > 1.75) {
        tr.landed = true;
        this.emit('land', { at: this.bonePoint('root', [0, -0.15, 0]) });
        this.emit('sound', { name: 'happy' });
      }
    } else if (tr.name === 'gallop') {
      // a happy rocking-horse canter on the spot: front up, hind up, three times
      const on = ramp(t, 0.0, 0.25) * (1 - ramp(t, 2.0, 2.35));
      const w = t * TAU * 1.45;
      const rock = Math.sin(w) * on;
      const hop = Math.max(0, Math.sin(w * 1.0 + 0.9)) * on;
      this.rearAbout(-0.22 * Math.max(0, rock), -0.056);
      B.root.position.y += hop * 0.022;
      addPose(B.root, 0.14 * Math.max(0, -rock), 0, 0);
      B.root.rotation.z += Math.sin(w * 0.5) * 0.04 * on;
      addPose(B.neck, 0.18 * rock, 0, 0);
      addPose(B.head, -0.1 * rock, Math.sin(w * 0.5) * 0.15 * on, 0);
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        const k = front ? Math.max(0, rock) : Math.max(0, -rock);
        const lift = clamp(k * 1.4 + hop * 0.6, 0, 1);
        L[i].plant = 1 - lift;
        const pp = Math.sin(w * 2 + i);
        L[i].off.set(0, (front ? 0.035 : 0.02) * lift, (front ? 0.012 + 0.006 * pp : -0.02) * lift);
        L[i].toe += (front ? 1.2 : 0.5) * lift;
      }
      this.tailUp = 0.9 * on;
      addPose(B.jaw, 0.2 * bump(t, 0.2, 1.6), 0, 0);
      tr.clop ??= 0.25;
      if (t > tr.clop && t < 2.0) {
        tr.clop += 1 / 1.45;
        this.emit('land', { at: this.bonePoint('root', [0, -0.15, 0.05]) });
      }
      if (!tr.s1 && t > 0.05) {
        tr.s1 = true;
        this.emit('sound', { name: 'gallop' });
      }
      if (!tr.s2 && t > 2.05) {
        tr.s2 = true;
        this.emit('sound', { name: 'happy' });
      }
    }
  }

  trickLength(name) {
    return { rear: 2.8, spin: 2.4, gallop: 2.6 }[name] || 2;
  }
}

// ------------------------------------------------------------ sounds

// a tiny wooden clip-clop
function clop(a, t, f = 1150, v = 0.08) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g).connect(a.sfx);
  o.start(t);
  o.stop(t + 0.1);
  // the scuff of the hoof: a short burst of noise with a proper release
  const n = ctx.createBufferSource();
  n.buffer = a.pink;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  bp.Q.value = 1.1;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(v * 0.45, t + 0.004);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  n.connect(bp).connect(ng).connect(a.sfx);
  n.start(t, Math.random());
  n.stop(t + 0.1);
}

// a soft little whinny: a trilled glide that rises and tumbles down
function whinny(a, t, { v = 0.08, up = 1 } = {}) {
  glide(a, t, [[0, 620 * up], [0.1, 1180 * up], [0.35, 980 * up], [0.62, 760 * up]], { v, formant: 1500, q: 1.4, trill: 17, trillDepth: 0.75, vibrato: 25, breath: 0.35 });
}

const SHIMMER = [1046.5, 1318.5, 1568, 2093, 2637, 3136];

export const calls = {
  happy(a, t) {
    whinny(a, t, { v: 0.075, up: 1.1 });
    a.bell(2093, 0.03, t + 0.3, 0.6);
    a.bell(2637, 0.025, t + 0.38, 0.6);
  },
  rear(a, t) {
    whinny(a, t, { v: 0.09, up: 1 });
  },
  sparkle(a, t) {
    puff(a, t, { v: 0.04, from: 1500, to: 4200, dur: 0.5 });
    SHIMMER.forEach((f, i) => a.bell(f, 0.018, t + 0.03 + i * 0.05, 0.9));
    for (let i = 0; i < 6; i++) a.bell(rand(2600, 4200), 0.012, t + 0.3 + i * 0.06, 0.5);
  },
  spin(a, t) {
    puff(a, t, { v: 0.04, from: 600, to: 2400, dur: 1.0 });
    [...SHIMMER, ...SHIMMER.slice().reverse()].forEach((f, i) => a.bell(f, 0.02, t + 0.08 + i * 0.09, 0.7));
  },
  gallop(a, t) {
    for (let i = 0; i < 3; i++) {
      const b = t + 0.2 + i / 1.45;
      clop(a, b, 1200, 0.07);
      clop(a, b + 0.09, 980, 0.06);
      clop(a, b + 0.3, 1100, 0.06);
    }
    whinny(a, t + 0.35, { v: 0.06, up: 1.2 });
  },
  paw(a, t) {
    clop(a, t, 900, 0.05);
    clop(a, t + 0.3, 850, 0.045);
  },
};
