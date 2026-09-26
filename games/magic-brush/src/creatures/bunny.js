// Hop, a baby bunny: a soft round loaf of a body with big haunches, a big
// round head with fluffy cheeks and huge glossy eyes, a pink button nose
// that twitches (and the whiskers twitch with it), long ears on springs with
// pink insides, big hind feet, little front paws and a cotton-ball tail.
// Dense fur carries the child's colours; the bib, muzzle and tail stay
// creamy white.
//
// Moves in hops: a crouch, a push off the long hind feet, a stretch through
// the air, front paws down first, then the hind feet, and a soft squash. The
// world carries the bunny along at an even pace; the body's own stride is
// put on the root bone (behind, then ahead of the world position), so the
// feet stay planted while on the ground and the speed pulses with each hop.
// Now and then, when still, it sits up tall on its haunches to look about.
//
// Tricks: 'binky' (the happy bunny jump: crouch, leap, twist and kick in
// the air, land, shake the head), 'ears' (ears flop down to the sides, wiggle
// in turn, then spring back up with a boing) and 'thump' (lifts its bottom
// and thumps its hind feet twice, sparkles bursting from the grass).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, frameFrom } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { hideMaterial } from './materials.js';
import { pose, addPose, bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp } from './anim.js';
import { glide, puff } from '../sound/calls.js';

const COAT = 0xf4ede4;
const CREAM = 0xfffaf3;
const PINK = 0xf5b0c2;
const NOSE = 0xec8aa2;
const MOUTH = 0x7a3c48;
const WHISKER = 0xfbf6ee;
const SPARKS = [[2.0, 1.2, 1.6], [1.5, 1.3, 2.0], [2.0, 1.7, 0.9], [1.3, 1.9, 1.5]];

const HEAD_C = [0, 0.158, 0.066];
const HEAD_R = [0.063, 0.057, 0.058];
const EYE = [0.0284, 0.166, 0.1046];
const EYE_DIR = [0.38, 0.06, 1];
const EYE_R = 0.022;
// the muzzle: between the whisker pads
const M = [0, 0.135, 0.117];
const NOSE_C = [0, M[1] + 0.01, M[2] + 0.009];
// the ear bones, base to tip (left ear; the right one is mirrored)
const EAR = [[0.023, 0.203, 0.054], [0.031, 0.245, 0.044], [0.038, 0.283, 0.033], [0.043, 0.316, 0.024]];
// each ear leans about its base (forwards +), mirrored for the right one
const EAR_LEAN = { L: 0.1, R: -0.1 };
function earPoints(S) {
  const a = EAR_LEAN[S];
  const b = EAR[0];
  const c = Math.cos(a), sn = Math.sin(a);
  return EAR.map((p) => {
    const dy = p[1] - b[1], dz = p[2] - b[2];
    return [p[0] * (S === 'L' ? 1 : -1), b[1] + dy * c - dz * sn, b[2] + dy * sn + dz * c];
  });
}
// the ear's flat face turns outwards and a little forwards
const EAR_OUT = [0.85, 0, 0.5];

// the hop: launch, front paws down, hind feet down (fractions of a hop)
const A = 0.12;
const F = 0.58;
const K = 0.68;
const stair = (p) => smooth((p - 0.1) / 0.62);

// smooth keyframes [[p, v], ...]
function keys(p, k) {
  if (p <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++)
    if (p <= k[i][0]) {
      const a = k[i - 1];
      const b = k[i];
      return lerp(a[1], b[1], smooth((p - a[0]) / (b[0] - a[0])));
    }
  return k[k.length - 1][1];
}

const V = (a) => new THREE.Vector3(...a);

// Per-frame tables, made once (animate() allocates nothing): keyframes over
// a hop, and bone names by side (0: left, 1: right).
const PITCH_K = [[0, 0], [A, -0.12], [0.3, -0.07], [0.5, 0.1], [F, 0.17], [K, 0.08], [0.82, 0], [1, 0]];
const STRETCH_K = [[0, 0], [A, 0.02], [0.22, 0.09], [0.45, 0.04], [F, 0], [1, 0]];
const CURL_K = [[0, 0.04], [A, -0.1], [0.3, -0.12], [F, 0.08], [K, 0.14], [0.85, 0.02], [1, 0.04]];
const THIGH_K = [[0, 0], [0.1, -0.1], [0.15, 0.35], [0.24, 0.95], [0.42, 0.45], [0.58, -0.28], [K, 0], [1, 0]];
const FOOT_K = [[0, 0], [0.1, 0.05], [0.16, 0.6], [0.24, 1.15], [0.42, 0.35], [0.58, -0.18], [K, 0], [1, 0]];
// (the last key, where the paw lands, is set each hop)
const ARM_K = [[0, 0], [0.1, 0.08], [0.2, 0.6], [0.32, 0.3], [0.48, -0.55], [F, 0]];
const PAW_K = [[0, 0], [0.2, 0.9], [0.35, 0.4], [0.5, -0.25], [F, 0], [1, 0]];
const HIND_FLAT_K = [[0, 1], [0.12, 1], [0.2, 0], [0.6, 0], [K, 1], [1, 1]];
const FRONT_FLAT_K = [[0, 1], [0.1, 1], [0.18, 0], [0.55, 0], [F, 1], [1, 1]];
const TAIL_K = [[0, 0], [A, -0.3], [0.4, 0.35], [K, 0.1], [1, 0]];
const THIGH = ['thighL', 'thighR'];
const FOOT = ['footL', 'footR'];
const ARM = ['armL', 'armR'];
const PAW = ['pawL', 'pawR'];
const EAR0 = ['ear0L', 'ear0R'];
const EAR1 = ['ear1L', 'ear1R'];
const EAR2 = ['ear2L', 'ear2R'];
const EYE_PARTS = [['eyeL', 'lidL', 'shutL', 'joyL'], ['eyeR', 'lidR', 'shutR', 'joyR']];
const SHUT = ['shutL', 'shutR'];
const JOY = ['joyL', 'joyR'];
// a front paw reaches out, lands and stays put as the body goes over it
const THUMPS = [0.85, 1.32];
const planted = (q, L) => -Math.asin(clamp((L * (1 - stair(q))) / 0.056, -0.9, 0.9));
// an ear plan from a trick (unset fields leave the ear alone)
const earPlan = () => ({ pitch: undefined, roll: undefined, yaw: undefined, tip: undefined, bend: undefined, w: 1 });
function clearEar(E) {
  E.pitch = E.roll = E.yaw = E.tip = E.bend = undefined;
  E.w = 1;
  return E;
}

// Parts that only show now and then (the closed-eye lines) are modelled
// shrunk to a speck round their bone and scaled up by 1 / TINY when shown,
// so the rest pose (which is what lies flat on the canvas before the friend
// comes alive) has none of them.
const TINY = 0.01;
function tiny(g, c) {
  return g.translate(-c[0], -c[1], -c[2]).scale(TINY, TINY, TINY).translate(c[0], c[1], c[2]);
}

// an ellipsoid spanning a..b (radii: [thin, half length, width]) with its
// thin axis turned towards `out`
function span(s, a, b, radii, out, o) {
  const y = V(b).sub(V(a)).normalize();
  const x = V(out);
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'XYZ');
  const c = V(a).lerp(V(b), o.at ?? 0.5).toArray();
  s.ellipsoid(c, radii, { ...o, rot: [e.x, e.y, e.z] });
}

// a torus round the axis n, its centre `depth` out from c along n
function ring(s, c, n, depth, R, r, o) {
  const y = V(n).normalize();
  const x = new THREE.Vector3(1, 0, 0);
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'XYZ');
  s.torus(V(c).addScaledVector(y, depth).toArray(), R, r, { ...o, rot: [e.x, e.y, e.z] });
}

// the nearest point on a surface (projected onto the tangent plane of the
// nearest vertex), lifted off it by eps, and its normal
function onSurface(geo, p, eps = 0) {
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const dx = pos[i] - p[0], dy = pos[i + 1] - p[1], dz = pos[i + 2] - p[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const n = [nor[best], nor[best + 1], nor[best + 2]];
  const k = (p[0] - pos[best]) * n[0] + (p[1] - pos[best + 1]) * n[1] + (p[2] - pos[best + 2]) * n[2] - eps;
  return { p: [p[0] - n[0] * k, p[1] - n[1] * k, p[2] - n[2] * k], n };
}

export class Bunny extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.furry = true;
    this.hideOpts = { sheen: 0.85, clearcoat: 0.7 };
    this.voxelScale = 0.8;
    this.walkSpeed = 0.3;
    this.turnRate = 2.6;
    this.hopScale = 1.2;
    this.shared.uFurLen.value = 0.0092;
    this.shared.uStrand.value = 0.0016;
    this.shared.uComb.value.set(0, -0.22, -0.55);
    this.shared.uSplat.value = 0.18;
    this.sparkleColors = SPARKS;
    // hopping
    this.hopping = false;
    this.hopP = 0;
    this.stride = 0;
    this.hopH = 0;
    // sitting up to look about
    this.stillT = 0;
    this.scope = -1;
    this.scopeDur = 3;
    // secondary motion
    this.headYaw = new Spring(0, 1.8, 0.75);
    this.headPitch = new Spring(0, 1.8, 0.75);
    this.bodyPitch = new Spring(0, 2.2, 0.6);
    const ear = () => ({ pitch: new Spring(0, 2.0, 0.26), roll: new Spring(0, 1.9, 0.24), yaw: new Spring(0, 2.4, 0.4), tip: new Spring(0, 2.6, 0.2), tYaw: 0, tPitch: 0, tRoll: 0, timer: Math.random() * 2 });
    this.ears = [ear(), ear()];
    this.tail = new Spring(0, 3, 0.25);
    // the trick plan, reused every frame
    this.tp = { y: 0, pitch: 0, roll: 0, yaw: 0, sq: 0, ears: null, squint: 0, head: [0, 0, 0], up: 0, rump: 0, after: null, a: 0, b: 0, c: 0, d: 0 };
    this.earPlans = [earPlan(), earPlan()];
    this._hp = new THREE.Vector3();
    this._pp = new THREE.Vector3();
    this._pv = new THREE.Vector3();
    this._hv = new THREE.Vector3();
    this._acc = new THREE.Vector3();
    this._accOn = false;
    this.noseT = 1;
    this.noseOn = 0;
    this.prevYaw = null;
    // how closed the eyes are (the blinker's value, seen here as it is used)
    this.shut = 0;
    this.joy = 0;
    const blink = this.blinker.update.bind(this.blinker);
    this.blinker.update = (dt) => (this.shut = blink(dt));
  }

  get tricks() {
    return ['binky', 'ears', 'thump'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0.07, 0]);
    s.bone('hips', 'root', [0, 0.068, -0.03]);
    s.bone('chest', 'root', [0, 0.08, 0.03]);
    s.bone('head', 'chest', [0, 0.125, 0.058]);
    s.bone('nose', 'head', [0, M[1] + 0.0025, M[2] - 0.0015]);
    this.eyeBones(s, EYE);
    // closed-eye lines: a content curve for blinks, a happy arch for squints
    s.bones2('shut', 'head', EYE);
    s.bones2('joy', 'head', EYE);
    // the ears lean a little differently, so both show from the side
    for (const S of ['L', 'R']) {
      const E = earPoints(S);
      s.bone('ear0' + S, 'head', E[0]);
      s.bone('ear1' + S, 'ear0' + S, E[1]);
      s.bone('ear2' + S, 'ear1' + S, E[2]);
    }
    s.bone('tail', 'hips', [0, 0.078, -0.08]);
    s.bones2('thigh', 'hips', [0.042, 0.074, -0.04]);
    s.bones2('foot', 'thigh', [0.044, 0.016, -0.05]);
    s.bones2('arm', 'chest', [0.022, 0.076, 0.05]);
    s.bones2('paw', 'arm', [0.023, 0.02, 0.062]);

    const fur = { paint: 0.95, fur: 1, rough: 0.8, pat: 0, tint: COAT };
    const cream = { paint: 0.3, fur: 1.3, rough: 0.8, tint: CREAM };
    s.setLook(fur);
    // body: a soft loaf, big round haunches at the back
    s.ellipsoid([0, 0.066, -0.03], [0.056, 0.062, 0.062], { bone: 'hips', k: 0.04 });
    s.ellipsoid([0, 0.082, 0.03], [0.046, 0.052, 0.044], { bone: 'chest', k: 0.04 });
    s.ellipsoid([0, 0.045, 0.004], [0.04, 0.03, 0.056], { bone: 'root', k: 0.03, ...cream, paint: 0.45, fur: 1.1 });
    // a fluffy bib
    s.ellipsoid([0, 0.09, 0.058], [0.032, 0.036, 0.022], { bone: 'chest', k: 0.025, ...cream, fur: 1.5 });
    // haunches and long hind feet
    s.ellipsoid([0.042, 0.056, -0.036], [0.026, 0.045, 0.048], { bone: 'thighL', k: 0.03, sym: true, fur: 1.1 });
    s.ellipsoid([0.044, 0.011, -0.008], [0.017, 0.011, 0.048], { bone: 'footL', k: 0.018, sym: true, fur: 0.75 });
    // front legs and little paws, tucked under the bib
    s.cone([0.022, 0.07, 0.05], [0.023, 0.022, 0.062], 0.012, 0.0095, { bone: 'armL', k: 0.02, sym: true, fur: 0.8 });
    s.ellipsoid([0.023, 0.0095, 0.069], [0.0105, 0.0095, 0.014], { bone: 'pawL', k: 0.012, sym: true, fur: 0.7 });
    // cotton tail
    s.sphere([0, 0.078, -0.09], 0.022, { bone: 'tail', k: 0.02, ...cream, paint: 0.15, fur: 2.6 });
    // the head: big and round, with fluffy cheeks
    const head = { bone: 'head', fur: 0.75 };
    s.ellipsoid(HEAD_C, HEAD_R, { ...head, k: 0.03 });
    s.sphere([0.034, 0.133, 0.088], 0.028, { ...head, k: 0.02, sym: true, fur: 1.35 });
    s.ellipsoid([0, M[1] - 0.0135, M[2] - 0.0085], [0.012, 0.008, 0.01], { ...head, k: 0.012, ...cream, paint: 0.35, fur: 0.3 });
    // a soft rim of short fur round each eye
    ring(s, EYE, EYE_DIR, EYE_R * 0.46, EYE_R * 0.93, 0.0022, { ...head, k: 0.006, sym: true, fur: 0.3 });
    // the muzzle: two puffy whisker pads and a pink button nose
    s.sphere([0.012, M[1], M[2]], 0.014, { bone: 'nose', k: 0.01, sym: true, ...cream, paint: 0.35, fur: 0.5 });
    s.ellipsoid(NOSE_C, [0.0095, 0.0065, 0.006], { bone: 'nose', k: 0.006, tint: NOSE, paint: 0, fur: 0, rough: 0.3 });
    // ears: long and thin, cupped, with pink insides
    const earLook = { k: 0.012, fur: 0.4 };
    const inner = { k: 0.006, sub: true, tint: PINK, paint: 0.1, fur: 0.3, rough: 0.6 };
    for (const S of ['L', 'R']) {
      const E = earPoints(S);
      const out = [EAR_OUT[0] * (S === 'L' ? 1 : -1), EAR_OUT[1], EAR_OUT[2]];
      const o = V(out).normalize().multiplyScalar(0.0085);
      const shift = (p) => [p[0] + o.x, p[1] + o.y, p[2] + o.z];
      span(s, E[0], E[1], [0.0092, 0.03, 0.0165], out, { ...earLook, bone: 'ear0' + S, at: 0.45 });
      span(s, E[1], E[2], [0.0086, 0.031, 0.0205], out, { ...earLook, bone: 'ear1' + S });
      span(s, E[2], E[3], [0.007, 0.024, 0.017], out, { ...earLook, bone: 'ear2' + S, at: 0.4 });
      // the pink hollow inside
      span(s, shift(E[0]), shift(E[2]), [0.0055, 0.042, 0.0125], out, { ...inner, bone: 'ear1' + S, at: 0.55 });
      span(s, shift(E[2]), shift(E[3]), [0.005, 0.02, 0.01], out, { ...inner, bone: 'ear2' + S, at: 0.3 });
    }
  }

  parts(s) {
    const I = s.index;
    const geo = this.body.geometry;
    this.addEyes(s, {
      c: EYE,
      r: EYE_R,
      dir: EYE_DIR,
      iris: 0x8a5a48,
      iris2: 0x3a2030,
      irisSize: 0.97,
      pupil: 0.5,
      lid: { tint: COAT, paint: 0.95, fur: 0.75, rough: 0.8, open: -0.55, closed: 1.45 },
    });
    // soft velvet lids: no gloss, just a little sheen
    const lidMat = hideMaterial(this.shared, { furry: true, sheen: 0.35, clearcoat: 0 });
    for (const m of this.meshes) if (m !== this.body && m.material === this.hide) m.material = lidMat;
    // a fine dark line along each lid's rim, with three little lashes
    // flicking out at the outer corner
    const lashG = [];
    for (const side of [1, -1]) {
      const cc = [EYE[0] * side, EYE[1], EYE[2]];
      const fr = frameFrom([EYE_DIR[0] * side, EYE_DIR[1], EYE_DIR[2]]);
      const R = EYE_R * 1.07 * 1.012;
      const tilt = -0.35; // as the lid is tipped back (see lidGeometry)
      const outer = side > 0 ? 0 : Math.PI;
      const dir = side > 0 ? 1 : -1;
      const toRest = ([x, y, z]) => {
        const yy = y * Math.cos(tilt) - z * Math.sin(tilt);
        const zz = y * Math.sin(tilt) + z * Math.cos(tilt);
        return [cc[0] + fr.x.x * x + fr.y.x * yy + fr.z.x * zz, cc[1] + fr.x.y * x + fr.y.y * yy + fr.z.y * zz, cc[2] + fr.x.z * x + fr.y.z * yy + fr.z.z * zz];
      };
      const rim = (phi, out = 0, up = 0) => toRest([(R + out) * Math.cos(phi), up, (R + out) * Math.sin(phi)]);
      const pts = [];
      for (let i = 0; i <= 20; i++) pts.push(rim(outer + dir * lerp(0.12, Math.PI - 0.35, i / 20)));
      lashG.push(bindTo(tubeGeometry(pts, [0.0004, 0.0008, 0.001, 0.001, 0.0008, 0.0004], { radial: 6, steps: 40 }), I['lid' + (side > 0 ? 'L' : 'R')]));
      for (const [a, len] of [[0.2, 0.0065], [0.42, 0.0075], [0.66, 0.006]]) {
        const phi = outer + dir * a;
        const lp = [0, 0.33, 0.66, 1].map((k) => rim(phi, len * k * 0.8, len * (k * 0.35 + k * k * 0.5)));
        lashG.push(bindTo(tubeGeometry(lp, [0.0005, 0.00035, 0.0002], { radial: 5, steps: 8 }), I['lid' + (side > 0 ? 'L' : 'R')]));
      }
    }
    // the line a closed lid makes, drawn on the closed lid: a soft smile of
    // a line for a blink, an arch for a happy squint (shown only when shut)
    for (const side of [1, -1]) {
      const cc = [EYE[0] * side, EYE[1], EYE[2]];
      const fr = frameFrom([EYE_DIR[0] * side, EYE_DIR[1], EYE_DIR[2]]);
      const Rs = EYE_R * 1.07 * 1.025;
      const toRest = ([x, y, z]) => [cc[0] + fr.x.x * x + fr.y.x * y + fr.z.x * z, cc[1] + fr.x.y * x + fr.y.y * y + fr.z.y * z, cc[2] + fr.x.z * x + fr.y.z * y + fr.z.z * z];
      for (const [bone, shape] of [['shut', (u) => -0.12 - 0.2 * (1 - u * u)], ['joy', (u) => -0.12 + 0.3 * (1 - Math.pow(Math.abs(u), 1.4))]]) {
        const onEye = (u, dy = 0, out = 0) => {
          const x = -u * 0.78 * Rs * side;
          const y = (shape(u) + dy) * Rs;
          const r = Rs + out;
          return toRest([x, y, Math.sqrt(Math.max(0, r * r - x * x - y * y))]);
        };
        const pts = [];
        for (let i = 0; i <= 16; i++) pts.push(onEye(-1 + (2 * i) / 16));
        const B = I[bone + (side > 0 ? 'L' : 'R')];
        lashG.push(bindTo(tiny(tubeGeometry(pts, [0.0005, 0.0009, 0.0011, 0.0011, 0.0009, 0.0005], { radial: 6, steps: 32 }), cc), B));
        for (const [u, len] of [[-0.92, 0.006], [-0.75, 0.005]]) {
          const lp = [0, 0.5, 1].map((k) => onEye(u - k * 0.25, -k * len * 12 * (bone === 'joy' ? -0.5 : 1) - k * k * 0.1, k * len * 0.5));
          lashG.push(bindTo(tiny(tubeGeometry(lp, [0.00045, 0.0003, 0.00018], { radial: 5, steps: 6 }), cc), B));
        }
      }
    }
    this.addMesh(mergeGeometries(lashG.map((g) => withLook(g, { tint: 0x3a2228, rough: 0.4 }))), this.mat('solid', { clearcoat: 0.3 }), { shadow: false }).userData.noProject = true;
    // the mouth: a little 'y' under the nose
    const line = (pts) => pts.map((p) => onSurface(geo, p, 0.0006).p);
    const mouth = [];
    const mz = (q) => q.map((v) => [v[0], M[1] + v[1], M[2] + v[2]]);
    mouth.push(tubeGeometry(line(mz([[0, 0.005, 0.012], [0, 0.0015, 0.012], [0, -0.0015, 0.011]])), [0.0008, 0.0008, 0.0007], { radial: 6, steps: 8 }));
    for (const sd of [1, -1])
      mouth.push(tubeGeometry(line(mz([[0, -0.0015, 0.011], [0.004 * sd, -0.004, 0.01], [0.0085 * sd, -0.0035, 0.0075], [0.0115 * sd, -0.002, 0.0045]])), [0.0007, 0.0007, 0.0006, 0.0004], { radial: 6, steps: 12 }));
    const mg = mergeGeometries(mouth.map((g) => withLook(g, { tint: MOUTH, rough: 0.5 })));
    this.addMesh(bindTo(mg, I.nose), this.mat('solid'), { shadow: false }).userData.noProject = true;
    // whiskers, three a side, fanning out from the pads (they twitch with the nose)
    const wh = [];
    for (const sd of [1, -1])
      for (const [dy, up, len] of [[0.004, 0.18, 0.056], [0, 0.02, 0.062], [-0.004, -0.14, 0.054]]) {
        const r = onSurface(geo, [0.022 * sd, M[1] + dy, M[2]], 0.0004).p;
        const d = V([sd, up, 0.42]).normalize();
        const pts = [0, 0.33, 0.66, 1].map((k) => [r[0] + d.x * len * k, r[1] + d.y * len * k - 0.008 * k * k, r[2] + d.z * len * k - 0.006 * k * k]);
        wh.push(withLook(tubeGeometry(pts, [0.0006, 0.00045, 0.0003, 0.00015], { radial: 5, steps: 12 }), { tint: WHISKER, rough: 0.35 }));
      }
    this.addMesh(bindTo(mergeGeometries(wh), I.nose), this.mat('solid', { clearcoat: 0.4 }), { shadow: false }).userData.noProject = true;
  }

  // ------------------------------------------------------------ motion

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    const tr = this.trick;
    const greeting = tr && (tr.name === 'hello' || tr.name === 'bye');
    const doing = tr && !greeting;
    const air = m.air;
    const root = B.root;

    // turning on the spot is done in little hops too
    const yawRate = this.prevYaw === null || dt <= 0 ? 0 : clamp(Math.atan2(Math.sin(this.object.rotation.y - this.prevYaw), Math.cos(this.object.rotation.y - this.prevYaw)) / dt, -4, 4);
    this.prevYaw = this.object.rotation.y;
    this.turning = lerp(this.turning ?? 0, Math.abs(yawRate) > 0.5 ? 1 : 0, 1 - Math.exp(-dt * 8));

    // ---- the hop cycle
    const pace = clamp(m.speed / this.walkSpeed, 0, 1.3);
    const wantHop = (m.speed > 0.02 || this.turning > 0.5) && air === 0 && !doing;
    if (!this.hopping && wantHop) {
      this.hopping = true;
      this.hopP = 0;
    }
    let p = 0;
    if (this.hopping) {
      const hz = lerp(1.7, 2.4, clamp(pace, 0, 1)) * (doing ? 2 : 1);
      this.hopP += dt * hz;
      if (this.hopP >= 1) {
        this.hopP -= 1;
        if (!wantHop) {
          this.hopping = false;
          this.hopP = 0;
        }
      }
      p = this.hopP;
      // stride and height are set at the start of each hop, then held
      if (p < 0.1) {
        this.stride = m.speed / hz;
        this.hopH = clamp(this.stride * 0.45, 0.012, 0.052);
      }
    }
    const L = this.hopping ? this.stride : 0;
    const hs = this.hopping ? clamp(this.hopH / 0.045, 0, 1.15) : 0;
    const H = this.hopping ? this.hopH : 0;

    // body motion over the hop: behind the world position while planted,
    // bounding ahead while in the air (the speed pulses with the hop)
    let y = 0;
    let dz = 0;
    let pitch = 0;
    let sqY = 0; // squash (+) / stretch (-)
    let stretchZ = 0;
    if (this.hopping) {
      dz = L * (stair(p) - p);
      const crouch = bump(p, -0.02, A + 0.02);
      const land = bump(p, F - 0.02, 0.92);
      if (p > A && p < F) y += H * Math.sin((Math.PI * (p - A)) / (F - A));
      y += -0.007 * hs * crouch - 0.009 * hs * land;
      pitch = keys(p, PITCH_K) * hs;
      stretchZ = keys(p, STRETCH_K) * hs;
      sqY = (0.06 * crouch + 0.08 * land) * hs - stretchZ * 0.5;
    }

    // ---- sitting up tall now and then when still (periscope)
    const still = !this.hopping && m.speed < 0.01 && !tr && air === 0;
    this.stillT = still ? this.stillT + dt : 0;
    if (this.scope < 0 && this.stillT > 4 && Math.random() < dt * 0.12) {
      this.scope = 0;
      this.scopeDur = 2.6 + Math.random() * 2;
    }
    let up = 0;
    if (this.scope >= 0) {
      this.scope += dt;
      if (!still) this.scope = Math.max(this.scope, this.scopeDur - 0.45);
      up = ramp(this.scope, 0, 0.5) * (1 - ramp(this.scope, this.scopeDur - 0.45, this.scopeDur));
      if (this.scope >= this.scopeDur) this.scope = -1;
    }

    // ---- trick plan (tricks add to the pose below)
    const tp = this.tp;
    tp.y = tp.pitch = tp.roll = tp.yaw = tp.sq = tp.squint = tp.up = tp.rump = 0;
    tp.head[0] = tp.head[1] = tp.head[2] = 0;
    tp.ears = null;
    tp.after = null;
    if (doing) this.trickPlan(tr, dt, tp);
    up = Math.max(up, tp.up);

    // ---- the root: position, pitch, squash
    const upPitch = -0.3 * up;
    const bp = this.bodyPitch.update(pitch, dt);
    const rx = bp + upPitch + tp.pitch + tp.rump * 0.21;
    root.position.y += y + tp.y;
    root.position.z += dz;
    // pivot a pitch about the feet that stay down: nose-down tips over the
    // front paws, nose-up (and sitting up) over the hind heels
    {
      const d0 = rx > 0 ? -0.07 : -0.066;
      const d1 = rx > 0 ? 0.069 : -0.056;
      const c = Math.cos(rx), sn = Math.sin(rx);
      root.position.y += d0 * (1 - c) + d1 * sn;
      root.position.z += d1 * (1 - c) - d0 * sn;
    }
    root.rotation.set(rx, tp.yaw, tp.roll);
    // leaping off the canvas: long and stretched
    const sq = sqY + tp.sq;
    root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5 + stretchZ + air * 0.06);
    const breathe = Math.sin(t * TAU * 0.95);
    B.chest.scale.set(1 + breathe * 0.012, 1 + breathe * 0.016, 1 + breathe * 0.01);

    // ---- the back arches and curls through the hop
    const curl = this.hopping ? keys(p, CURL_K) * hs : 0;
    const hipsRx = curl + up * 0.12 + tp.rump * 0.3;
    const chestRx = -curl * 0.5 - up * 0.85;
    pose(B.hips, hipsRx, 0, 0);
    pose(B.chest, chestRx, 0, 0);

    // ---- legs: keyframed through the hop; flat on the ground when down
    const legs = this.hopping ? hs : 0;
    const thigh = keys(p, THIGH_K) * legs;
    const footK = keys(p, FOOT_K) * legs;
    let arm = 0;
    let paw = 0;
    if (this.hopping) {
      ARM_K[5][1] = planted(F, L);
      arm = p < F ? keys(p, ARM_K) * hs : planted(p, L);
      paw = keys(p, PAW_K) * hs;
    }
    const hindFlat = this.hopping ? keys(p, HIND_FLAT_K) : 1;
    const frontFlat = (this.hopping ? keys(p, FRONT_FLAT_K) : 1) * (1 - up);
    const footW = lerp(footK, -(rx + hipsRx + thigh), hindFlat);
    // sitting up: front paws tucked to the chest
    const armW = lerp(arm + up * 0.85, arm - (rx + chestRx), frontFlat);
    const pawW = lerp(paw + up * 1.2, -(rx + chestRx + armW), frontFlat);
    for (let i = 0; i < 2; i++) {
      pose(B[THIGH[i]], thigh, 0, 0);
      pose(B[FOOT[i]], footW, 0, 0);
      pose(B[ARM[i]], armW, 0, (i === 0 ? -1 : 1) * up * 0.12);
      pose(B[PAW[i]], pawW, 0, 0);
    }
    if (air > 0) {
      const a = air;
      for (let i = 0; i < 2; i++) {
        addPose(B[ARM[i]], -1.0 * a, 0, 0);
        addPose(B[PAW[i]], 0.4 * a, 0, 0);
        addPose(B[THIGH[i]], 0.9 * a, 0, 0);
        addPose(B[FOOT[i]], 1.0 * a, 0, 0);
      }
      root.rotation.x += -0.12 * a;
    }
    if (doing && tp.after) this.afterPose(tp);

    // ---- head: looks about, stays level through the hop
    let yaw = Math.sin(t * 0.37 + 1) * 0.3 + Math.sin(t * 0.15) * 0.2;
    let hpitch = Math.sin(t * 0.29) * 0.08;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z - 0.06), -0.8, 0.8);
      hpitch = clamp(-Math.atan2(this.lookLocal.y - 0.16, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.4, 0.35);
    }
    if (up > 0) yaw += Math.sin(t * 1.1) * 0.35 * up;
    const moving = this.hopping ? 1 : 0;
    const hy = this.headYaw.update(yaw * (1 - moving * 0.7), dt);
    const hp = this.headPitch.update(hpitch - rx * 0.75 - chestRx * 0.85, dt);
    pose(B.head, hp + tp.head[0], hy + tp.head[1], Math.sin(t * 0.5) * 0.06 + tp.head[2]);

    // ---- nose: twitches in little bursts, faster when sniffing about
    this.noseT -= dt;
    if (this.noseT <= 0) {
      this.noseOn = this.noseOn > 0 ? 0 : 0.5 + Math.random() * 1.2;
      this.noseT = this.noseOn > 0 ? this.noseOn : 0.6 + Math.random() * 2.5;
    }
    const sniff = this.noseOn > 0 || up > 0.5 ? 1 : 0;
    this.noseAmt = lerp(this.noseAmt ?? 0, sniff, 1 - Math.exp(-dt * 12));
    const tw = Math.sin(t * TAU * 7.5) * this.noseAmt;
    B.nose.position.y += tw * 0.0009;
    pose(B.nose, tw * 0.05, 0, 0);

    // ---- ears: springs, swivelling to listen, flung about by every hop
    // how the head (where the ears are rooted) is being thrown about, in
    // the bunny's own space
    const acc = this.headAccel(dt);
    for (let i = 0; i < 2; i++) {
      const e = this.ears[i];
      const side = i === 0 ? 1 : -1;
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = 1.2 + Math.random() * 3;
        e.tYaw = (Math.random() - 0.35) * 0.9;
        e.tPitch = (Math.random() - 0.6) * 0.3;
        e.tRoll = Math.random() * 0.15;
        // a quick flick now and then
        if (Math.random() < 0.3) e.yaw.kick(side * (Math.random() < 0.5 ? 6 : -6));
      }
      let tPitch = e.tPitch - 0.18 * moving - 0.5 * air;
      let tRoll = e.tRoll + 0.05;
      let tYaw = e.tYaw * (1 - moving * 0.5);
      let tTip = 0.05;
      let bend = 0;
      if (up > 0) {
        tPitch = lerp(tPitch, 0.12, up);
        tYaw = lerp(tYaw, 0.35 + Math.sin(t * 1.3 + i) * 0.3, up);
        tRoll = lerp(tRoll, 0, up);
      }
      if (tp.ears) {
        const E = tp.ears[i];
        const w = E.w ?? 1;
        if (E.pitch !== undefined) tPitch = lerp(tPitch, E.pitch, w);
        if (E.roll !== undefined) tRoll = lerp(tRoll, E.roll, w);
        if (E.yaw !== undefined) tYaw = lerp(tYaw, E.yaw, w);
        if (E.tip !== undefined) tTip = lerp(tTip, E.tip, w);
        if (E.bend !== undefined) bend = E.bend * w;
      }
      // inertia: a lift throws the ears back, a landing flings them forward
      const G = 7;
      const pk = (-acc.z - acc.y * 0.35) * dt * G;
      e.pitch.kick(pk);
      e.tip.kick(pk * 1.6);
      e.roll.kick((-acc.x * side * G + yawRate * side * -0.6) * dt);
      const ep = e.pitch.update(tPitch, dt);
      const er = e.roll.update(tRoll, dt);
      const ey = e.yaw.update(tYaw, dt);
      const et = e.tip.update(tTip, dt);
      pose(B[EAR0[i]], ep, ey * side, -er * side);
      pose(B[EAR1[i]], et * 0.5 + ep * 0.2, 0, -(er * 0.25 + bend * 0.45) * side);
      pose(B[EAR2[i]], et, 0, -(er * 0.2 + bend * 0.7) * side);
    }

    // ---- cotton tail: flicks up with every landing
    const tl = this.tail.update(this.hopping ? keys(p, TAIL_K) * hs : 0, dt);
    this.tail.kick(-acc.y * dt * 1.5);
    pose(B.tail, -tl + Math.sin(t * 2.3) * 0.03, Math.sin(t * 1.7) * 0.06, 0);

    this.blinker.hold = smooth((tp.squint - 0.25) / 0.3);
    this.joy = tp.squint > 0.05 ? 1 : 0;
  }

  // after the eyes and lids are posed: show the closed-eye lines only while
  // the lids are down
  poseEyes(dt, camera) {
    super.poseEyes(dt, camera);
    const k = smooth((this.shut - 0.75) / 0.2);
    // closed eyes sink in a little, so the lids lie soft and low
    const sink = smooth(this.shut) * EYE_R * 0.22;
    const d = (this._eyeDir ??= new THREE.Vector3(...EYE_DIR).normalize());
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? 1 : -1;
      for (const n of EYE_PARTS[i]) {
        const q = this.bones[n].position;
        q.x -= d.x * sx * sink;
        q.y -= d.y * sink;
        q.z -= d.z * sink;
      }
      this.bones[SHUT[i]].scale.setScalar(Math.max(1e-4, k * (1 - this.joy)) / TINY);
      this.bones[JOY[i]].scale.setScalar(Math.max(1e-4, k * this.joy) / TINY);
    }
  }

  // the acceleration of the top of the head in the bunny's own space
  // (smoothed a little), for the ears' follow-through
  headAccel(dt) {
    const B = this.bones;
    this.object.updateMatrixWorld();
    const p = B.ear0L.parent.localToWorld(this._hp.set(0, 0.07, 0));
    // the point above the head bone, back in the object's space
    this.object.worldToLocal(p);
    const out = this._acc;
    if (!this._accOn || dt <= 0) {
      this._accOn = true;
      this._pp.copy(p);
      this._pv.set(0, 0, 0);
      return out.set(0, 0, 0);
    }
    // velocity, then acceleration (in _hv), all in scratch vectors
    const v = this._hv.copy(p).sub(this._pp).divideScalar(dt);
    this._pp.copy(p);
    const vx = v.x, vy = v.y, vz = v.z;
    const a = v.sub(this._pv).divideScalar(dt);
    this._pv.set(vx, vy, vz);
    a.clampLength(0, 40);
    return out.lerp(a, 1 - Math.exp(-dt * 30));
  }

  // Trick plans: each fills tp (root moves, ear targets, squint, head) and
  // poses what else it needs straight onto the bones afterwards.
  trickPlan(tr, dt, tp) {
    const t = tr.t;
    const hop = this.hopScale;
    if (tr.name === 'binky') {
      // crouch, leap, twist and kick in the air, land, a happy head shake
      const load = ramp(t, 0.0, 0.38) * (1 - ramp(t, 0.4, 0.5));
      const T0 = 0.46, T1 = 1.1;
      const k = clamp((t - T0) / (T1 - T0), 0, 1);
      const inAir = t > T0 && t < T1;
      const h = inAir ? 0.1 * hop * Math.sin(Math.PI * k) : 0;
      const landed = t - T1;
      const settle = landed > 0 ? wobble(landed, 2.2, 0.7) : 0;
      tp.y = h - load * 0.014 - (landed > 0 ? Math.abs(settle) * 0.012 : 0);
      tp.sq = load * 0.1 - (inAir ? bump(k, 0, 0.5) * 0.08 : 0) + (landed > 0 ? Math.max(0, settle) * 0.12 : 0);
      tp.pitch = load * 0.06 + (inAir ? lerp(-0.4, 0.3, smooth(k)) : 0) + (landed > 0 ? 0.3 * Math.exp(-landed * 8) : 0);
      // the twist: body one way, then the other, a kick of the hind legs
      const tw = inAir ? Math.sin(k * TAU) : 0;
      tp.yaw = tw * 0.55;
      tp.roll = inAir ? Math.sin(k * TAU + 0.8) * 0.3 : 0;
      const shake = bump(t, 1.45, 2.2);
      tp.head[0] = load * 0.15 - (inAir ? 0.2 * bump(k, 0, 1) : 0);
      tp.head[1] = -tw * 0.6;
      tp.head[2] = Math.sin((t - 1.45) * TAU * 4.2) * 0.3 * shake;
      tp.ears = this.earPlans;
      for (const E of tp.ears) {
        clearEar(E).pitch = -0.45;
        E.w = load + (inAir ? 0.8 : 0);
      }
      tp.squint = 0.85 * (bump(t, 1.3, 2.4) > 0 ? smooth(bump(t, 1.3, 2.4) * 1.5) : 0);
      // (legs posed after the rest: see afterPose)
      tp.after = 'binky';
      tp.a = inAir ? k : -1;
      tp.b = load;
      tp.c = tw;
      if (!tr.fired && t > T0 - 0.04) {
        tr.fired = true;
        this.emit('sound', { name: 'binky' });
      }
      if (!tr.top && t > (T0 + T1) / 2) {
        tr.top = true;
        this.emit('sparkle', { at: this.worldCenter(), count: 30, colors: SPARKS, up: 0.5, speed: 0.7, size: 0.02 });
      }
      if (!tr.landed && t > T1) {
        tr.landed = true;
        this.emit('land', { at: this.bonePoint('root') });
        this.emit('sparkle', { at: this.groundPoint(0.02), count: 26, colors: SPARKS, up: 0.6, speed: 0.8, size: 0.02 });
      }
      if (!tr.happy && t > 1.45) {
        tr.happy = true;
        this.emit('sound', { name: 'happy' });
      }
    } else if (tr.name === 'ears') {
      // ears up tall, flop down to the sides, wiggle in turn, spring back up
      const perk = ramp(t, 0, 0.3) * (1 - ramp(t, 0.36, 0.5));
      const flop = ramp(t, 0.38, 0.5) * (1 - ramp(t, 2.2, 2.28));
      const wig = ramp(t, 0.85, 1.1) * (1 - ramp(t, 2.0, 2.2));
      const w = Math.sin((t - 0.85) * TAU * 2.1) * wig;
      tp.up = 0.25 * perk;
      tp.ears = this.earPlans;
      for (let i = 0; i < 2; i++) {
        const sd = i === 0 ? 1 : -1;
        const E = tp.ears[i];
        E.pitch = lerp(0.15 * perk, 0.35 + 0.15 * w * sd, flop);
        E.roll = lerp(0, 1.2 + 0.4 * w * sd, flop);
        E.yaw = lerp(0.2 * perk, 0.5, flop);
        E.tip = lerp(0, 0.3 + 0.2 * w * sd, flop);
        E.bend = flop * (0.9 - 0.35 * w * sd);
        E.w = Math.max(perk, flop);
      }
      tp.head[0] = 0.05 * flop;
      tp.head[2] = w * 0.2;
      tp.roll = w * 0.05;
      tp.y = Math.abs(w) * 0.004;
      tp.squint = 0.85 * wig;
      if (!tr.flop && t > 0.38) {
        tr.flop = true;
        this.emit('sound', { name: 'flop' });
      }
      if (!tr.wig && t > 0.9) {
        tr.wig = true;
        this.emit('sound', { name: 'wiggle' });
      }
      if (!tr.boing && t > 2.2) {
        tr.boing = true;
        this.emit('sound', { name: 'boing' });
        for (const e of this.ears) {
          e.pitch.kick(-2);
          e.tip.kick(-6);
        }
      }
      if (!tr.pop && t > 2.36) {
        tr.pop = true;
        for (const S of ['L', 'R']) this.emit('sparkle', { at: this.bonePoint('ear2' + S, [0, 0.034, 0]), count: 16, colors: SPARKS, up: 0.6, speed: 0.5, size: 0.018 });
        this.happy.kick(3);
      }
    } else if (tr.name === 'thump') {
      // sits up alert, drops forward with its bottom up, two thumps of the
      // hind feet, then a proud little bounce
      const alert = ramp(t, 0, 0.25) * (1 - ramp(t, 0.32, 0.55));
      const rump = ramp(t, 0.38, 0.6) * (1 - ramp(t, 1.5, 1.75));
      const thumps = THUMPS;
      let lift = 0;
      let jolt = 0;
      for (const T of thumps) {
        lift = Math.max(lift, ramp(t, T - 0.24, T - 0.08) * (t < T ? 1 : 0));
        if (t >= T) jolt = Math.max(jolt, Math.exp(-(t - T) * 12));
      }
      const proud = bump(t, 1.75, 2.65);
      const bounce = Math.abs(Math.sin((t - 1.75) * TAU * 1.6)) * proud;
      tp.up = 0.45 * alert;
      tp.rump = rump;
      tp.y = -jolt * 0.008 + bounce * 0.02;
      tp.sq = jolt * 0.1 - bounce * 0.03;
      tp.ears = this.earPlans;
      for (const E of tp.ears) {
        clearEar(E);
        E.pitch = 0.12;
        E.yaw = -0.15;
        E.roll = -0.08;
        E.tip = -0.05;
        E.w = Math.max(alert, rump);
      }
      tp.head[0] = -0.1 * rump + jolt * 0.08;
      tp.squint = smooth(proud * 1.6);
      tp.after = 'thump';
      tp.a = lift;
      tp.b = rump;
      for (let n = 0; n < thumps.length; n++) {
        if (!(tr['th' + n]) && t > thumps[n]) {
          tr['th' + n] = true;
          this.emit('sound', { name: 'thump' });
          for (const S of ['L', 'R']) this.emit('sparkle', { at: this.groundPoint(0.012, this.bonePoint('foot' + S, [0, 0, 0.01])), count: 22, colors: SPARKS, up: 1.1, speed: 0.7, size: 0.02 });
          // a ring of sparkles runs out across the grass
          const g = this.groundPoint(0.012, this.bonePoint('hips', [0, 0, -0.01]));
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * TAU + n * 0.45;
            this.emit('puff', { at: g, dir: g.clone().add(new THREE.Vector3(Math.cos(a), 0.12, Math.sin(a))), count: 7, speed: 0.8, push: 0.8, size: 0.017, colors: SPARKS });
          }
          for (const e of this.ears) {
            e.pitch.kick(4);
            e.tip.kick(7);
          }
        }
      }
      if (!tr.happy && t > 1.8) {
        tr.happy = true;
        this.emit('sound', { name: 'happy' });
        this.happy.kick(3);
      }
    }
  }

  // what a trick poses on the legs after the rest of the pose
  afterPose(tp) {
    const B = this.bones;
    if (tp.after === 'binky') {
      const inAir = tp.a >= 0;
      const k = Math.max(0, tp.a);
      const load = tp.b;
      const tw = tp.c;
      const kick = inAir ? bump(k, 0.15, 0.85) : 0;
      for (let i = 0; i < 2; i++) {
        const sd = i === 0 ? 1 : -1;
        addPose(B[THIGH[i]], (inAir ? 0.9 * (1 - k) - 0.2 : 0) - load * 0.1, 0, sd * 0.55 * kick * tw);
        addPose(B[FOOT[i]], inAir ? 1.0 * (1 - k) + 0.3 * kick : 0, 0, 0);
        addPose(B[ARM[i]], inAir ? lerp(0.5, -0.6, smooth(k)) : load * 0.1, 0, 0);
        addPose(B[PAW[i]], inAir ? 0.6 * (1 - k) : 0, 0, 0);
      }
      B.hips.rotation.y += tw * 0.35;
      B.chest.rotation.y -= tw * 0.2;
    } else if (tp.after === 'thump') {
      for (let i = 0; i < 2; i++) {
        addPose(B[THIGH[i]], tp.a * 0.75, 0, 0);
        addPose(B[FOOT[i]], tp.b * 0.45 + tp.a * 0.7, 0, 0);
      }
    }
  }

  // a world point on the ground under the bunny (or under p)
  groundPoint(lift = 0, p = null) {
    const g = this.object.getWorldPosition(new THREE.Vector3());
    const out = p ? p.clone() : this.worldCenter();
    out.y = g.y + lift;
    return out;
  }

  trickLength(name) {
    return { binky: 2.5, ears: 3.0, thump: 2.8 }[name] || 2;
  }
}

// ------------------------------------------------------------ sounds

// a soft thud: a falling low sine and a puff of air
function thud(a, t, v = 0.09) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(62, t + 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(g).connect(a.sfx);
  o.start(t);
  o.stop(t + 0.3);
  puff(a, t, { v: v * 0.6, from: 220, to: 420, dur: 0.12 });
}

export const calls = {
  // a soft chirrup, twice, and a tiny bell
  happy: (a, t) => {
    glide(a, t, [[0, 1250], [0.06, 1700], [0.12, 1550]], { v: 0.08, formant: 1900, q: 1.5, trill: 30, trillDepth: 0.5, breath: 0.35 });
    glide(a, t + 0.15, [[0, 1450], [0.05, 1900], [0.13, 1750]], { v: 0.07, formant: 2000, q: 1.5, trill: 28, trillDepth: 0.5, breath: 0.3 });
    a.bell(2637, 0.03, t + 0.3, 0.5);
  },
  // a whoosh and a rising boing, then bells
  binky: (a, t) => {
    puff(a, t, { v: 0.06, from: 350, to: 1600, dur: 0.35 });
    glide(a, t + 0.02, [[0, 520], [0.22, 1350], [0.34, 1200]], { v: 0.05, type: 'sine', formant: 1100, q: 0.9, vibrato: 12 });
    [1568, 1976, 2349, 3136].forEach((f, i) => a.bell(f, 0.024, t + 0.3 + i * 0.07, 0.6));
  },
  // two soft falling flops
  flop: (a, t) => {
    glide(a, t, [[0, 900], [0.2, 420]], { v: 0.045, type: 'sine', formant: 800, q: 0.8 });
    puff(a, t + 0.05, { v: 0.05, from: 260, to: 520, dur: 0.22 });
    puff(a, t + 0.12, { v: 0.045, from: 240, to: 480, dur: 0.22 });
  },
  // a wobbly little trill while the ears wiggle
  wiggle: (a, t) => {
    glide(a, t, [[0, 1300], [0.3, 1500], [0.6, 1350], [0.9, 1550]], { v: 0.06, formant: 1800, trill: 9, trillDepth: 0.8, breath: 0.25 });
  },
  // ears spring back up
  boing: (a, t) => {
    glide(a, t, [[0, 380], [0.12, 1050], [0.4, 900]], { v: 0.042, type: 'sine', formant: 900, q: 0.8, vibrato: 30 });
    a.bell(2093, 0.028, t + 0.12, 0.6);
    a.bell(2637, 0.022, t + 0.2, 0.6);
  },
  thump: (a, t) => {
    thud(a, t);
    a.bell(2349, 0.016, t + 0.03, 0.4);
  },
};
