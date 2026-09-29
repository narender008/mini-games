// Mittens, a kitten: a big round head with fluffy cheeks, huge green-gold
// eyes, pointed ears with pink fluffy insides, a pink button nose over a
// little 'w' of a mouth, long whiskers, a fluffy bib, soft paws with pink
// toe beans and a long springy tail that curls up at the tip. Soft fur
// carries the child's colours; the bib, belly and muzzle stay creamy.
//
// Trots on planted feet (two-bone IK, diagonal pairs), sits down when it
// has been still a while, tail curled round its paws.
//
// Tricks: 'pounce' (spots something, crouches with a bottom wiggle, leaps,
// pins it with both paws, peeks, sparkles fly out), 'stretch' (a long cat
// stretch, bottom up, then a big yawn and a soft mew) and 'roll' (flops over
// onto its back, paws in the air, wriggles and purrs, rolls back up).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, frameFrom } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { hideMaterial } from './materials.js';
import { pose, addPose, bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp, twoBone, Bend } from './anim.js';
import { glide, puff } from '../sound/calls.js';
import { Tracker, Gait } from './pal-kit.js';

const COAT = 0xf0a050;
const CREAM = 0xfff4e6;
const PINK = 0xf4a3b6;
const NOSE = 0xef8aa0;
const MOUTH = 0x5a2432;
const MOUTH_IN = 0x8a2c40;
const TONGUE = 0xf07d92;
const WHISKER = 0xfdf8f0;
const SPARKS = [[2.0, 1.5, 0.7], [1.9, 1.2, 1.6], [1.3, 1.9, 1.2], [1.9, 1.8, 1.2]];

const HEAD_C = [0, 0.162, 0.074];
const HEAD_R = [0.063, 0.054, 0.055];
const EYE = [0.0264, 0.1668, 0.1122];
const EYE_DIR = [0.35, 0.05, 1];
const EYE_R = 0.021;
const NOSE_C = [0, 0.1495, 0.1285];
// the top middle of the mouth, just under the 'w'
const MOUTH_AT = [0, 0.1372, 0.1262];
// the tail, from the root to the curled tip
const TAIL = [[0, 0.1, -0.098], [0, 0.108, -0.14], [0, 0.13, -0.176], [0, 0.166, -0.195], [0, 0.202, -0.19], [0, 0.224, -0.168]];
const TAIL_R = [0.016, 0.0145, 0.0135, 0.0125, 0.0115, 0.0095];
// legs: [upper, lower, paw] bone rest positions (left side)
const FRONT = [[0.026, 0.1, 0.05], [0.028, 0.056, 0.039], [0.028, 0.017, 0.055]];
const HIND = [[0.03, 0.092, -0.06], [0.033, 0.052, -0.044], [0.033, 0.017, -0.068]];

const V = (a) => new THREE.Vector3(...a);

// Per-frame tables, made once (animate() allocates nothing)
const GAIT = { FL: 0, HR: 0.03, FR: 0.5, HL: 0.53 };
const LEG_KEYS = ['FL', 'FR', 'HL', 'HR'];
const STEP_ORDER = { FL: 0, FR: 1, HL: 2, HR: 3 };
const ARM = ['armL', 'armR'];
const FORE = ['foreL', 'foreR'];
const PAW = ['pawL', 'pawR'];
const THIGH = ['thighL', 'thighR'];
const SHIN = ['shinL', 'shinR'];
const FOOT = ['footL', 'footR'];
const EAR = ['earL', 'earR'];
const EAR_TIP = ['earTipL', 'earTipR'];
const TAIL_B = ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'];
const EYE_PARTS = [['eyeL', 'lidL', 'shutL', 'joyL'], ['eyeR', 'lidR', 'shutR', 'joyR']];
const SHUT = ['shutL', 'shutR'];
const JOY = ['joyL', 'joyR'];
// the tail: walking sway, and lying round the paws when sitting
const TAIL_WALK = [0.18, 0.05, 0.02, 0.05, 0.12];
const TAIL_SIT_X = [-0.07, -0.6, -1.2, -0.58, -0.73];
const TAIL_SIT_Y = [0.75, 0.85, 0.85, 0.75, 0.5];
const TAIL_POUNCE = [-0.4, 0.05, 0.05, 0.05, 0.1];
const TAIL_STRETCH = [-0.55, -0.2, 0.05, 0.1, 0.15];
// how far over it has rolled through the roll trick
const ROLL_K = [[0, 0], [0.35, 0.15], [0.75, 1.5], [1.1, 2.55], [2.45, 2.55], [2.85, 1.4], [3.3, 0]];

// Parts that only show now and then (the closed-eye lines, the open mouth) are modelled
// shrunk to a speck round their bone and scaled up by 1 / TINY when shown,
// so the rest pose (which is what lies flat on the canvas before the friend
// comes alive) has none of them.
const TINY = 0.01;
function tiny(g, c) {
  return g.translate(-c[0], -c[1], -c[2]).scale(TINY, TINY, TINY).translate(c[0], c[1], c[2]);
}

// smooth keyframes [[t, v], ...]
function set3(a, x, y, z) {
  a[0] = x;
  a[1] = y;
  a[2] = z;
  return a;
}

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
// nearest vertex), lifted off it by eps
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
  return [p[0] - n[0] * k, p[1] - n[1] * k, p[2] - n[2] * k];
}

const _w = new THREE.Vector3();
const _gs = [0, 0];

// A leg of an upper bone, a lower bone and a paw, bending in its own y-z
// plane: the ankle is placed on a target given in the friend's object space
// (two-bone IK) and the paw kept level. bend: +1 knee forwards (a hind
// leg), -1 elbow backwards (a front leg).
class Leg {
  constructor(friend, names, bend) {
    this.f = friend;
    this.n = names;
    this.bend = bend;
    const S = friend.sculptor;
    const P = (n) => S.bones[S.index[n]].pos;
    const [h, k, a] = names.map(P);
    this.rest = a.slice();
    this.l1 = Math.hypot(k[1] - h[1], k[2] - h[2]);
    this.l2 = Math.hypot(a[1] - k[1], a[2] - k[2]);
    this.u0 = Math.atan2(k[2] - h[2], -(k[1] - h[1]));
    this.w0 = Math.atan2(a[2] - k[2], -(a[1] - k[1]));
    this.target = new THREE.Vector3(...a);
    this.lift = 0; // 0..1 of a step (tips the paw)
    this._ik = [0, 0]; // (scratch for the solve)
    this.ease = new Bend(); // (the knee eases where the paw lifts and lands)
  }

  // pose the leg so the ankle lands on this.target; pitch: how much the
  // parents are pitched in all (to keep the paw level)
  solve(pitch, w = 1) {
    const B = this.f.bones;
    const up = B[this.n[0]];
    const lo = B[this.n[1]];
    const paw = B[this.n[2]];
    const parent = up.parent;
    parent.updateWorldMatrix(true, false);
    _w.copy(this.target);
    this.f.object.localToWorld(_w);
    parent.worldToLocal(_w);
    const dy = _w.y - up.position.y;
    const dz = _w.z - up.position.z;
    const base = Math.atan2(dz, -dy);
    const ik = twoBone(this.l1, this.l2, Math.hypot(dy, dz), this._ik, 0.05);
    this.ease.apply(this.l1, this.l2, ik, this.f.frameDt || 1 / 60);
    const a1 = ik[0];
    const knee = ik[1];
    const u = base + this.bend * a1;
    const wl = u - this.bend * knee;
    const ux = -(u - this.u0);
    const lx = -(wl - this.w0 - (u - this.u0));
    up.rotation.x = lerp(up.rotation.x, ux, w);
    lo.rotation.x = lerp(lo.rotation.x, lx, w);
    const flat = -(pitch + up.rotation.x + lo.rotation.x) + this.lift * 0.5 * this.bend;
    paw.rotation.x = lerp(paw.rotation.x, flat, w);
  }
}

export class Kitten extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.furry = true;
    this.hideOpts = { sheen: 0.85, clearcoat: 0.6 };
    this.voxelScale = 0.85;
    this.walkSpeed = 0.28;
    this.turnRate = 2.8;
    this.hopScale = 1.1;
    this.shared.uFurLen.value = 0.0086;
    this.shared.uStrand.value = 0.0015;
    this.shared.uComb.value.set(0, -0.2, -0.6);
    this.shared.uSplat.value = 0.2;
    this.sparkleColors = SPARKS;
    // gait
    this.phase = 0;
    this.stepAmt = 0;
    this.stillT = 0;
    this.track = new Tracker();
    this.sit = new Spring(0, 1.1, 0.9);
    this.sitting = false;
    // secondary motion
    this.headYaw = new Spring(0, 1.8, 0.75);
    this.headPitch = new Spring(0, 1.8, 0.75);
    this.ears = [0, 1].map(() => ({ yaw: new Spring(0, 2.6, 0.35), pitch: new Spring(0, 2.4, 0.3), tYaw: 0, tPitch: 0, timer: Math.random() * 2 }));
    this.tailS = [0, 1, 2, 3, 4].map((i) => ({ x: new Spring(0, 1.7 - i * 0.12, 0.3), y: new Spring(0, 1.5 - i * 0.12, 0.3) }));
    this.twitchT = 1;
    this.prevYaw = null;
    this.shut = 0;
    this.joy = 0;
    // the trick plan, reused every frame
    const tail = [0, 1, 2, 3, 4].map(() => [0, 0]);
    tail.w = 1;
    this.tp = {
      y: 0, z: 0, pitch: 0, roll: 0, yaw: 0, sq: 0, ears: null, squint: 0, head: [0, 0, 0], neck: [0, 0, 0], jaw: 0, legs: null, ik: 1, tail: null, chestY: 0, hipsY: 0, hipsRx: 0, chestRx: 0,
      after: null, a: 0, b: 0, c: 0,
      earPlan: [{ yaw: 0, pitch: 0, w: 1 }, { yaw: 0, pitch: 0, w: 1 }],
      legPlan: { FL: null, FR: null, HL: null, HR: null },
      legAt: { FL: [0, 0, 0], FR: [0, 0, 0], HL: [0, 0, 0], HR: [0, 0, 0] },
      tailPlan: tail,
    };
    const blink = this.blinker.update.bind(this.blinker);
    this.blinker.update = (dt) => (this.shut = blink(dt));
  }

  get tricks() {
    return ['pounce', 'stretch', 'roll'];
  }

  async build() {
    await super.build();
    this.legs = {
      FL: new Leg(this, ['armL', 'foreL', 'pawL'], -1),
      FR: new Leg(this, ['armR', 'foreR', 'pawR'], -1),
      HL: new Leg(this, ['thighL', 'shinL', 'footL'], 1),
      HR: new Leg(this, ['thighR', 'shinR', 'footR'], 1),
    };
    return this;
  }

  sculpt(s) {
    s.bone('root', null, [0, 0.088, 0]);
    s.bone('chest', 'root', [0, 0.095, 0.035]);
    s.bone('hips', 'root', [0, 0.09, -0.05]);
    s.bone('neck', 'chest', [0, 0.118, 0.058]);
    s.bone('head', 'neck', [0, 0.14, 0.07]);
    s.bone('jaw', 'head', [0, 0.1385, 0.088]);
    // the open mouth (a yawn, a mew) grows down from the upper lip
    s.bone('mouth', 'head', MOUTH_AT);
    this.eyeBones(s, EYE);
    s.bones2('shut', 'head', EYE);
    s.bones2('joy', 'head', EYE);
    s.bones2('ear', 'head', [0.036, 0.198, 0.067]);
    s.bones2('earTip', 'ear', [0.045, 0.225, 0.064]);
    s.bone('tail0', 'hips', TAIL[0]);
    for (let i = 1; i < 5; i++) s.bone('tail' + i, 'tail' + (i - 1), TAIL[i]);
    s.bones2('arm', 'chest', FRONT[0]);
    s.bones2('fore', 'arm', FRONT[1]);
    s.bones2('paw', 'fore', FRONT[2]);
    s.bones2('thigh', 'hips', HIND[0]);
    s.bones2('shin', 'thigh', HIND[1]);
    s.bones2('foot', 'shin', HIND[2]);

    const coat = { paint: 0.95, fur: 1, rough: 0.8, pat: 0, tint: COAT };
    const cream = { paint: 0.3, fur: 1.3, rough: 0.8, tint: CREAM };
    s.setLook(coat);
    // body
    s.ellipsoid([0, 0.095, 0.035], [0.04, 0.046, 0.05], { bone: 'chest', k: 0.04 });
    s.ellipsoid([0, 0.09, -0.05], [0.042, 0.045, 0.056], { bone: 'hips', k: 0.04 });
    s.ellipsoid([0, 0.072, -0.008], [0.033, 0.026, 0.062], { bone: 'root', k: 0.03, ...cream, paint: 0.35, fur: 1.2 });
    s.ellipsoid([0, 0.106, 0.072], [0.026, 0.034, 0.018], { bone: 'chest', k: 0.025, ...cream, fur: 1.6 });
    s.cone([0, 0.108, 0.052], [0, 0.136, 0.07], 0.03, 0.028, { bone: 'neck', k: 0.03, fur: 1.2 });
    // head: round and wide, fluffy cheeks, a cream muzzle, a pink nose
    const head = { bone: 'head', fur: 0.75 };
    s.ellipsoid(HEAD_C, HEAD_R, { ...head, k: 0.03 });
    s.ellipsoid([0.039, 0.142, 0.086], [0.028, 0.023, 0.026], { ...head, k: 0.02, sym: true, fur: 1.5 });
    s.sphere([0.0105, 0.14, 0.12], 0.012, { ...head, k: 0.01, sym: true, ...cream, paint: 0.3, fur: 0.35 });
    s.ellipsoid([0, 0.156, 0.12], [0.01, 0.009, 0.01], { ...head, k: 0.012, fur: 0.5 });
    // a pink nose, wider at the top
    s.ellipsoid([0, NOSE_C[1], NOSE_C[2] + 0.001], [0.0095, 0.0058, 0.006], { ...head, k: 0.004, tint: NOSE, paint: 0, fur: 0, rough: 0.3 });
    s.ellipsoid([0, NOSE_C[1] - 0.0045, NOSE_C[2]], [0.004, 0.004, 0.0045], { ...head, k: 0.004, tint: NOSE, paint: 0, fur: 0, rough: 0.3 });
    // the lower jaw
    s.ellipsoid([0, 0.1295, 0.107], [0.017, 0.0095, 0.016], { bone: 'jaw', k: 0.012, ...cream, paint: 0.3, fur: 0.35 });
    // a soft rim of short fur round each eye
    ring(s, EYE, EYE_DIR, EYE_R * 0.5, EYE_R * 0.93, 0.002, { ...head, k: 0.006, sym: true, fur: 0.45 });
    // ears: cupped triangles with pink fluffy insides
    const ear = { k: 0.01, sym: true, fur: 0.45 };
    s.cone([0.036, 0.196, 0.067], [0.045, 0.225, 0.064], 0.021, 0.0125, { ...ear, bone: 'earL' });
    s.cone([0.045, 0.225, 0.064], [0.053, 0.252, 0.061], 0.0125, 0.0028, { ...ear, bone: 'earTipL' });
    const inner = { k: 0.004, sym: true, sub: true, tint: PINK, paint: 0.1, fur: 1.1, rough: 0.7 };
    s.cone([0.038, 0.2, 0.077], [0.046, 0.227, 0.072], 0.014, 0.0088, { ...inner, bone: 'earL' });
    s.cone([0.046, 0.227, 0.072], [0.052, 0.247, 0.067], 0.0088, 0.002, { ...inner, bone: 'earTipL' });
    // the tail: long and fluffy, curling up at the tip
    s.chain(TAIL, TAIL_R, { bones: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'], k: 0.015, fur: 1.5 });
    // front legs and paws
    const leg = { sym: true, fur: 0.8 };
    s.cone(FRONT[0], FRONT[1], 0.02, 0.015, { ...leg, bone: 'armL', k: 0.025 });
    s.cone(FRONT[1], FRONT[2], 0.015, 0.013, { ...leg, bone: 'foreL', k: 0.012 });
    // hind legs: a round haunch, a slim shin
    s.ellipsoid([0.032, 0.078, -0.058], [0.02, 0.03, 0.033], { ...leg, bone: 'thighL', k: 0.03, fur: 1.05 });
    s.cone(HIND[1], HIND[2], 0.0145, 0.0125, { ...leg, bone: 'shinL', k: 0.014 });
    // paws: soft ovals with toe bumps, pink beans underneath
    const pads = { k: 0.002, sym: true, tint: PINK, paint: 0, fur: 0, rough: 0.45 };
    for (const [x, z, bone] of [[0.028, 0.064, 'pawL'], [0.033, -0.058, 'footL']]) {
      s.ellipsoid([x, 0.0098, z], [0.0152, 0.0098, 0.019], { ...leg, bone, k: 0.012, fur: 0.65 });
      for (const dx of [-0.0068, 0, 0.0068]) s.sphere([x + dx, 0.0095, z + 0.013 - Math.abs(dx) * 0.3], 0.0055, { ...leg, bone, k: 0.004, fur: 0.6 });
      s.ellipsoid([x, 0.0036, z - 0.003], [0.0055, 0.0035, 0.005], { ...pads, bone });
      for (const dx of [-0.0068, 0, 0.0068]) s.sphere([x + dx, 0.0036, z + 0.0115 - Math.abs(dx) * 0.3], 0.0029, { ...pads, bone });
    }
  }

  parts(s) {
    const I = s.index;
    const geo = this.body.geometry;
    this.addEyes(s, {
      c: EYE,
      r: EYE_R,
      dir: EYE_DIR,
      iris: 0x86c63c,
      iris2: 0xd0a030,
      irisSize: 0.98,
      pupil: 0.5,
      lid: { tint: 0x6a4630, paint: 0.8, fur: 0.75, rough: 0.8, open: -0.55, closed: 1.45 },
    });
    // soft velvet lids: no gloss, just a little sheen
    const lidMat = hideMaterial(this.shared, { furry: true, sheen: 0.35, clearcoat: 0 });
    for (const m of this.meshes) if (m !== this.body && m.material === this.hide) m.material = lidMat;

    const lines = [];
    // a fine dark line along each lid's rim, with little lashes at the
    // outer corner; and the lines a closed lid makes (a content curve for a
    // blink, an arch for a happy squint), shown only while the eyes are shut
    for (const side of [1, -1]) {
      const cc = [EYE[0] * side, EYE[1], EYE[2]];
      const fr = frameFrom([EYE_DIR[0] * side, EYE_DIR[1], EYE_DIR[2]]);
      const toRest = ([x, y, z]) => [cc[0] + fr.x.x * x + fr.y.x * y + fr.z.x * z, cc[1] + fr.x.y * x + fr.y.y * y + fr.z.y * z, cc[2] + fr.x.z * x + fr.y.z * y + fr.z.z * z];
      const R = EYE_R * 1.07 * 1.012;
      const tilt = -0.35;
      const outer = side > 0 ? 0 : Math.PI;
      const dir = side > 0 ? 1 : -1;
      const rim = (phi, out = 0, up = 0) => {
        const x = (R + out) * Math.cos(phi), y = up, z = (R + out) * Math.sin(phi);
        return toRest([x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)]);
      };
      const lid = I['lid' + (side > 0 ? 'L' : 'R')];
      const pts = [];
      for (let i = 0; i <= 20; i++) pts.push(rim(outer + dir * lerp(0.12, Math.PI - 0.35, i / 20)));
      lines.push(bindTo(tubeGeometry(pts, [0.0004, 0.0008, 0.001, 0.001, 0.0008, 0.0004], { radial: 6, steps: 40 }), lid));
      for (const [a, len] of [[0.18, 0.006], [0.4, 0.007]]) {
        const phi = outer + dir * a;
        const lp = [0, 0.33, 0.66, 1].map((k) => rim(phi, len * k * 0.8, len * (k * 0.35 + k * k * 0.5)));
        lines.push(bindTo(tubeGeometry(lp, [0.0005, 0.00035, 0.0002], { radial: 5, steps: 8 }), lid));
      }
      const Rs = EYE_R * 1.07 * 1.025;
      for (const [bone, shape] of [['shut', (u) => -0.12 - 0.2 * (1 - u * u)], ['joy', (u) => -0.12 + 0.3 * (1 - Math.pow(Math.abs(u), 1.4))]]) {
        const onEye = (u, dy = 0, out = 0) => {
          const x = -u * 0.78 * Rs * side;
          const y = (shape(u) + dy) * Rs;
          const r = Rs + out;
          return toRest([x, y, Math.sqrt(Math.max(0, r * r - x * x - y * y))]);
        };
        const cp = [];
        for (let i = 0; i <= 16; i++) cp.push(onEye(-1 + (2 * i) / 16));
        const B = I[bone + (side > 0 ? 'L' : 'R')];
        lines.push(bindTo(tiny(tubeGeometry(cp, [0.0005, 0.0009, 0.0011, 0.0011, 0.0009, 0.0005], { radial: 6, steps: 32 }), cc), B));
        for (const [u, len] of [[-0.92, 0.006], [-0.75, 0.005]]) {
          const lp = [0, 0.5, 1].map((k) => onEye(u - k * 0.25, -k * len * 12 * (bone === 'joy' ? -0.5 : 1) - k * k * 0.1, k * len * 0.5));
          lines.push(bindTo(tiny(tubeGeometry(lp, [0.00045, 0.0003, 0.00018], { radial: 5, steps: 6 }), cc), B));
        }
      }
    }
    this.addMesh(mergeGeometries(lines.map((g) => withLook(g, { tint: 0x2e1a1c, rough: 0.4 }))), this.mat('solid', { clearcoat: 0.3 }), { shadow: false }).userData.noProject = true;

    // the mouth: a little 'w' under the nose
    const on = (p) => onSurface(geo, p, 0.0011);
    const mouth = [tubeGeometry([[0, 0.1425, 0.1288], [0, 0.1398, 0.128], [0, 0.1372, 0.1265]].map(on), [0.001, 0.001, 0.0009], { radial: 6, steps: 8 })];
    for (const sd of [1, -1]) mouth.push(tubeGeometry([[0, 0.1372, 0.1265], [0.0045 * sd, 0.1356, 0.1255], [0.0085 * sd, 0.1366, 0.123], [0.0115 * sd, 0.1383, 0.119]].map(on), [0.001, 0.001, 0.0009, 0.0006], { radial: 6, steps: 12 }));
    this.addMesh(bindTo(mergeGeometries(mouth.map((g) => withLook(g, { tint: MOUTH, rough: 0.5 }))), I.head), this.mat('solid'), { shadow: false }).userData.noProject = true;
    // the open mouth: a dark rosy oval with a pink tongue and two tiny
    // fangs, laid over the muzzle and grown from the upper lip when it
    // opens (flat and hidden when closed)
    const m0 = onSurface(geo, [0, MOUTH_AT[1] - 0.0068, MOUTH_AT[2]], 0.0);
    const mc = [0, MOUTH_AT[1] - 0.0068, m0[2] + 0.0028];
    const inside = new THREE.SphereGeometry(1, 24, 16);
    inside.scale(0.0118, 0.0078, 0.0032).translate(...mc);
    withLook(inside, { tint: MOUTH_IN, rough: 0.5 });
    const tongue = new THREE.SphereGeometry(1, 16, 10);
    tongue.scale(0.0062, 0.003, 0.0026).translate(mc[0], mc[1] - 0.0042, mc[2] + 0.0014);
    withLook(tongue, { tint: TONGUE, rough: 0.35 });
    const fangs = [1, -1].map((sd) => withLook(tubeGeometry([[0.0058 * sd, mc[1] + 0.0066, mc[2] + 0.0022], [0.0055 * sd, mc[1] + 0.0038, mc[2] + 0.0026], [0.0053 * sd, mc[1] + 0.0018, mc[2] + 0.0027]], [0.0011, 0.0007, 0.0002], { radial: 6, steps: 6 }), { tint: 0xfbf7f0, rough: 0.3 }));
    inside.deleteAttribute('uv');
    tongue.deleteAttribute('uv');
    this.addMesh(bindTo(tiny(mergeGeometries([inside, tongue, ...fangs]), MOUTH_AT), I.mouth), this.mat('solid', { clearcoat: 0.5 }), { shadow: false }).userData.noProject = true;
    // whiskers, four a side from the muzzle pads, and two over each eye
    const wh = [];
    for (const sd of [1, -1]) {
      for (const [dy, up, len] of [[0.0045, 0.2, 0.062], [0.0015, 0.07, 0.07], [-0.0015, -0.05, 0.066], [-0.0045, -0.17, 0.058]]) {
        const r = onSurface(geo, [0.018 * sd, 0.14 + dy, 0.12], 0.0004);
        const d = V([sd, up, 0.35]).normalize();
        const pts = [0, 0.33, 0.66, 1].map((k) => [r[0] + d.x * len * k, r[1] + d.y * len * k - 0.009 * k * k, r[2] + d.z * len * k - 0.008 * k * k]);
        wh.push(withLook(tubeGeometry(pts, [0.00055, 0.0004, 0.00028, 0.00012], { radial: 5, steps: 12 }), { tint: WHISKER, rough: 0.35 }));
      }
      for (const [dx, len] of [[0.004, 0.026], [0.011, 0.022]]) {
        const r = onSurface(geo, [(EYE[0] + dx) * sd, EYE[1] + EYE_R + 0.004, EYE[2] - 0.002], 0.0004);
        const d = V([0.5 * sd, 0.8, 0.3]).normalize();
        const pts = [0, 0.5, 1].map((k) => [r[0] + d.x * len * k, r[1] + d.y * len * k - 0.004 * k * k, r[2] + d.z * len * k]);
        wh.push(withLook(tubeGeometry(pts, [0.00045, 0.0003, 0.0001], { radial: 5, steps: 8 }), { tint: WHISKER, rough: 0.35 }));
      }
    }
    this.addMesh(bindTo(mergeGeometries(wh), I.head), this.mat('solid', { clearcoat: 0.4 }), { shadow: false }).userData.noProject = true;
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

    // how fast it turns (turning on the spot is done in little steps)
    const yawRate = this.prevYaw === null || dt <= 0 ? 0 : clamp(Math.atan2(Math.sin(this.object.rotation.y - this.prevYaw), Math.cos(this.object.rotation.y - this.prevYaw)) / dt, -4, 4);
    this.prevYaw = this.object.rotation.y;

    // ---- trick plan: fills tp, may pose extra bones after the rest
    const tp = this.tp;
    tp.y = tp.z = tp.pitch = tp.roll = tp.yaw = tp.sq = tp.squint = tp.jaw = 0;
    tp.chestY = tp.hipsY = tp.hipsRx = tp.chestRx = 0;
    tp.head[0] = tp.head[1] = tp.head[2] = 0;
    tp.neck[0] = tp.neck[1] = tp.neck[2] = 0;
    tp.ik = 1;
    tp.ears = tp.legs = tp.tail = tp.after = null;
    if (doing) this.trickPlan(tr, dt, tp);

    // ---- sitting down when it has been still a while
    const still = m.speed < 0.01 && !doing && air === 0 && Math.abs(yawRate) < 0.3;
    this.stillT = still ? this.stillT + dt : 0;
    if (!this.sitting && this.stillT > 3 && Math.random() < dt * 0.4) this.sitting = true;
    if (!still) this.sitting = false;
    const sit = clamp(this.sit.update(this.sitting ? 1 : 0, dt), 0, 1.05);

    // ---- the gait: a trot on planted feet, diagonal pairs
    const pace = clamp(m.speed / this.walkSpeed, 0, 1.3);
    const moveAmt = Math.max(pace, clamp(Math.abs(yawRate) / 1.5, 0, 0.5)) * (air > 0 ? 0 : 1) * (doing ? 0 : 1);
    this.stepAmt += ((moveAmt > 0.03 ? 1 : 0) - this.stepAmt) * (1 - Math.exp(-dt * 6));
    const hz = lerp(1.7, 2.6, clamp(pace, 0, 1)) * 0.8; // (a slower cadence with longer strides steps more smoothly)
    this.phase += dt * hz;
    const D = 0.56; // time on the ground
    const lift = 0.02 * clamp(pace * 1.4, 0.35, 1) * this.stepAmt;
    // a foot on the ground stays where it landed (the ground carries it back);
    // turning on the spot lifts the feet in little steps
    const gait = (this.gait ??= new Gait(4));
    gait.begin(this.track.update(this.object, dt), air, dt);
    for (let i = 0; i < 4; i++) {
      const k = LEG_KEYS[i];
      const L = this.legs[k];
      gait.step(i, this.phase + GAIT[k], D, hz, lift, 0.012, _gs);
      L.target.set(L.rest[0], L.rest[1] + _gs[1], L.rest[2] + _gs[0]);
      L.lift = _gs[1] / 0.02;
    }

    // ---- body: carried along, a little bob with each pair of steps
    const bob = Math.abs(Math.sin(this.phase * TAU)) * 0.004 * this.stepAmt;
    const breathe = Math.sin(t * TAU * 0.6);
    let rx = -0.03 * pace + tp.pitch;
    // sitting: hips down on the ground, chest up, front legs straight
    const hipsDown = 0.036 * sit;
    rx += -0.12 * sit;
    root.position.y += bob - 0.006 * this.stepAmt + tp.y;
    root.position.z += tp.z;
    root.rotation.set(rx, tp.yaw + Math.sin(this.phase * TAU) * 0.04 * this.stepAmt, tp.roll + Math.sin(this.phase * TAU) * 0.03 * this.stepAmt);
    const sq = tp.sq;
    root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    B.chest.scale.set(1 + breathe * 0.012, 1 + breathe * 0.016, 1 + breathe * 0.01);
    B.hips.position.y += -hipsDown + tp.hipsY;
    B.hips.position.z += 0.012 * sit;
    pose(B.hips, -0.55 * sit + tp.hipsRx, 0, 0);
    B.chest.position.y += tp.chestY;
    pose(B.chest, -0.22 * sit + tp.chestRx, 0, 0);

    // ---- legs: planted by IK; sitting folds the hind legs under
    if (sit > 0.001) {
      for (const k of LEG_KEYS) {
        const L = this.legs[k];
        L.target.z = lerp(L.target.z, L.rest[2] + (k[0] === 'H' ? 0.028 : 0.004), sit);
      }
    }
    if (tp.legs) {
      for (const k of LEG_KEYS) {
        const a = tp.legs[k];
        if (a) this.legs[k].target.set(a[0], a[1], a[2]);
      }
    }
    const ik = tp.ik * (1 - air);
    this.object.updateMatrixWorld();
    for (const k of LEG_KEYS) {
      const L = this.legs[k];
      const front = k[0] === 'F';
      const parentRx = front ? B.chest.rotation.x : B.hips.rotation.x;
      L.solve(root.rotation.x + parentRx, ik);
    }
    // leaping off the canvas: front paws reach, hind legs stretch back
    if (air > 0) {
      for (let i = 0; i < 2; i++) {
        pose(B[ARM[i]], -0.9 * air, 0, 0);
        pose(B[FORE[i]], -0.2 * air, 0, 0);
        pose(B[PAW[i]], 0.5 * air, 0, 0);
        pose(B[THIGH[i]], 0.8 * air, 0, 0);
        pose(B[SHIN[i]], 0.3 * air, 0, 0);
        pose(B[FOOT[i]], 0.6 * air, 0, 0);
      }
      root.rotation.x += -0.1 * air;
    }

    // ---- head: looks about, curious tilts
    let yaw = Math.sin(t * 0.37 + 2) * 0.35 + Math.sin(t * 0.14) * 0.2;
    let hpitch = Math.sin(t * 0.29) * 0.08;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z - 0.07), -0.9, 0.9);
      hpitch = clamp(-Math.atan2(this.lookLocal.y - 0.16, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.45, 0.35);
    }
    const hy = this.headYaw.update(yaw * (1 - this.stepAmt * 0.6), dt);
    const hp = this.headPitch.update(hpitch - rx * 0.8 - B.chest.rotation.x * 0.8, dt);
    pose(B.neck, hp * 0.35 + tp.neck[0], hy * 0.35 + tp.neck[1], tp.neck[2]);
    pose(B.head, hp * 0.65 - Math.sin(this.phase * TAU * 2) * 0.03 * this.stepAmt + tp.head[0], hy * 0.65 + tp.head[1], Math.sin(t * 0.45) * 0.1 + tp.head[2]);
    pose(B.jaw, tp.jaw * 0.4, 0, 0);
    // the mouth opens with the jaw (and shrinks right away to nothing when
    // shut, so no dark sliver shows under the nose)
    const open = clamp(tp.jaw / 0.6, 0, 1);
    const shown = smooth(open / 0.06);
    B.mouth.scale.set(Math.max(1e-4, shown * (0.75 + 0.25 * open)) / TINY, Math.max(1e-4, open) / TINY, Math.max(1e-4, shown) / TINY);
    B.mouth.position.y -= 0.001 * open;

    // ---- ears: swivel to listen, flick now and then
    for (let i = 0; i < 2; i++) {
      const e = this.ears[i];
      const side = i === 0 ? 1 : -1;
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = 1 + Math.random() * 3;
        e.tYaw = (Math.random() - 0.3) * 0.7;
        e.tPitch = (Math.random() - 0.5) * 0.25;
        if (Math.random() < 0.35) e.pitch.kick(Math.random() < 0.5 ? 7 : -7);
      }
      let ty = e.tYaw - 0.2 * this.stepAmt;
      let tpch = e.tPitch - 0.15 * this.stepAmt - 0.4 * air;
      if (tp.ears) {
        const E = tp.ears[i];
        ty = lerp(ty, E.yaw ?? ty, E.w ?? 1);
        tpch = lerp(tpch, E.pitch ?? tpch, E.w ?? 1);
      }
      const ey = e.yaw.update(ty, dt);
      const ep = e.pitch.update(tpch, dt);
      pose(B[EAR[i]], ep, ey * side, -ep * 0.3 * side);
      pose(B[EAR_TIP[i]], ep * 0.4, 0, 0);
    }

    // ---- tail: up and springy, the tip curling; sways as it walks, wraps
    // round the paws when sitting
    this.twitchT -= dt;
    if (this.twitchT < -0.5) this.twitchT = 1 + Math.random() * 3;
    const twitch = this.twitchT < 0 ? Math.sin(-this.twitchT * TAU * 3) * 0.35 : 0;
    for (let i = 0; i < 5; i++) {
      const s = this.tailS[i];
      const lagSway = Math.sin(t * 1.4 - i * 0.6) * (0.08 + i * 0.05) + Math.sin(this.phase * TAU - i * 0.7) * 0.1 * this.stepAmt;
      // sitting, it lies along the ground round one side to the front paws
      let tx = lerp(TAIL_WALK[i] * this.stepAmt + (i > 2 ? Math.sin(t * 2.1 - i) * 0.08 : 0), TAIL_SIT_X[i], sit) + (i === 4 ? twitch * 0.5 : 0);
      let ty = lerp(lagSway, TAIL_SIT_Y[i] + (i > 2 ? Math.sin(t * 1.3 - i) * 0.05 : 0), sit);
      if (tp.tail) {
        tx = lerp(tx, tp.tail[i][0], tp.tail.w ?? 1);
        ty = lerp(ty, tp.tail[i][1], tp.tail.w ?? 1);
      }
      pose(B[TAIL_B[i]], s.x.update(tx, dt), s.y.update(ty, dt), 0);
    }

    if (tp.after) this.afterPose(tp);
    this.blinker.hold = smooth((tp.squint - 0.25) / 0.3);
    this.joy = tp.squint > 0.05 ? 1 : 0;
  }

  // after the eyes and lids are posed: the closed-eye lines show only
  // while the lids are down, and closed eyes sink in a little
  poseEyes(dt, camera) {
    super.poseEyes(dt, camera);
    const k = smooth((this.shut - 0.75) / 0.2);
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

  trickPlan(tr, dt, tp) {
    const t = tr.t;
    const Lg = this.legs;
    if (tr.name === 'pounce') {
      // spots something, crouches and wiggles, leaps, pins it, peeks
      const spot = ramp(t, 0, 0.3);
      const crouch = ramp(t, 0.25, 0.6) * (1 - ramp(t, 1.15, 1.3));
      const wig = ramp(t, 0.6, 0.75) * (1 - ramp(t, 1.05, 1.15));
      const T0 = 1.22, T1 = 1.6;
      const k = clamp((t - T0) / (T1 - T0), 0, 1);
      const inAir = t > T0 && t < T1;
      const fwd = 0.09;
      const back = ramp(t, 2.3, 2.95); // shuffles back to where it was
      const reach = smooth(k) * (1 - back);
      const landed = t - T1;
      const settle = landed > 0 ? wobble(landed, 2.4, 0.6) : 0;
      const peek = bump(t, 1.95, 2.4);
      tp.y = -0.03 * crouch + (inAir ? 0.075 * Math.sin(Math.PI * k) : 0) - (landed > 0 ? Math.abs(settle) * 0.01 : 0) - 0.012 * (1 - back) * (t > T1 ? 1 : 0);
      tp.z = fwd * reach;
      tp.pitch = 0.08 * crouch + (inAir ? lerp(-0.35, 0.35, smooth(k)) : 0) + (t > T1 ? 0.18 * (1 - ramp(t, 2.0, 2.6)) : 0);
      tp.sq = 0.06 * crouch - (inAir ? bump(k, 0, 0.6) * 0.06 : 0) + (landed > 0 ? Math.max(0, settle) * 0.1 : 0);
      tp.hipsRx = -0.1 * crouch;
      tp.hipsY = 0.012 * crouch;
      tp.head[0] = 0.15 * crouch - 0.1 * spot * (1 - crouch) + 0.35 * (t > T1 ? 1 - back : 0) - 0.25 * peek;
      tp.head[2] = Math.sin(t * 5) * 0.12 * peek + 0.15 * (t > T1 ? 1 - back : 0);
      this.planEars(tp, -0.25, 0.15, Math.max(spot * (1 - back), 0));
      // the bottom wiggle (hips sway side to side), posed after the rest
      tp.after = 'pounce';
      tp.a = t;
      tp.b = wig;
      tp.c = peek;
      // feet: planted through the crouch, all off the ground in the leap,
      // down together in front, then a few shuffling steps back
      const lg = this.planLegs(tp);
      for (const key of LEG_KEYS) {
        const r = Lg[key].rest;
        const front = key[0] === 'F';
        let z = r[2];
        let y = r[1];
        if (t > T0) {
          if (inAir) {
            z = r[2] + fwd * k + (front ? 0.055 * bump(k, 0.1, 1.05) : -0.05 * bump(k, 0, 0.7));
            y = r[1] + (front ? 0.04 : 0.018) * Math.sin(Math.PI * k);
          } else {
            // after landing: stay put, then step back one foot at a time
            const order = STEP_ORDER[key];
            const q = ramp(t, 2.3 + order * 0.14, 2.3 + order * 0.14 + 0.2);
            z = r[2] + fwd * (1 - q);
            y = r[1] + 0.014 * Math.sin(Math.PI * q);
            if (key === 'FL') y += 0.016 * peek;
          }
        }
        // the front paws come together to pin it down
        const pin = front && t > T1 ? 1 - ramp(t, 2.3, 2.6) : front && inAir ? smooth(k) : 0;
        lg[key] = set3(tp.legAt[key], r[0] * (1 - 0.55 * pin), y, z);
      }
      const tl = (tp.tail = tp.tailPlan);
      for (let i = 0; i < 5; i++) {
        tl[i][0] = TAIL_POUNCE[i] * crouch;
        tl[i][1] = Math.sin(t * TAU * 3 - i) * 0.12 * crouch + (i === 4 ? Math.sin(t * 25) * 0.3 * crouch : 0);
      }
      tl.w = crouch;
      // a happy squint once it has it, eased open again before the end
      tp.squint = 0.85 * ramp(t, 2.45, 2.6) * (1 - ramp(t, 2.8, 3.05));
      if (!tr.fired && t > T0 - 0.04) {
        tr.fired = true;
        this.emit('sound', { name: 'pounce' });
      }
      if (!tr.pinned && t > T1) {
        tr.pinned = true;
        this.emit('land', { at: this.bonePoint('pawL') });
        this.emit('sparkle', { at: this.groundPoint(0.015, this.bonePoint('pawL', [-0.028, 0, 0.01])), count: 24, colors: SPARKS, up: 0.4, speed: 0.5, size: 0.018 });
      }
      if (!tr.peeked && t > 2.05) {
        tr.peeked = true;
        this.emit('sparkle', { at: this.groundPoint(0.03, this.bonePoint('pawL', [-0.028, 0, 0.012])), count: 36, colors: SPARKS, up: 1.4, speed: 0.6, size: 0.022, life: 1.6 });
      }
      if (!tr.happy && t > 2.45) {
        tr.happy = true;
        this.emit('sound', { name: 'happy' });
      }
    } else if (tr.name === 'stretch') {
      // front paws walk out, chest down and bottom up, a big yawn, a mew
      const reach = ramp(t, 0.15, 0.9) * (1 - ramp(t, 2.55, 3.1));
      const low = ramp(t, 0.3, 1.0) * (1 - ramp(t, 1.4, 1.9));
      const yawn = ramp(t, 1.25, 1.6) * (1 - ramp(t, 2.1, 2.4));
      const shake = bump(t, 2.35, 2.75);
      const quiver = Math.sin(t * 40) * 0.02 * low;
      tp.chestY = -0.05 * low;
      tp.chestRx = 0.25 * low;
      tp.hipsRx = -0.18 * low;
      tp.hipsY = 0.012 * low;
      tp.pitch = 0.12 * low;
      tp.neck[0] = -0.25 * yawn + 0.2 * low;
      tp.head[0] = -0.35 * yawn + 0.05 * low;
      tp.head[2] = Math.sin((t - 2.35) * TAU * 4) * 0.35 * shake;
      tp.jaw = 0.62 * yawn * (0.9 + 0.1 * Math.sin(t * 7));
      this.planEars(tp, 0.35 * yawn, -0.35 * Math.max(yawn, low), Math.max(yawn, low));
      tp.squint = Math.max(0.95 * yawn, 0.6 * low);
      const lg = this.planLegs(tp);
      for (let f = 0; f < 2; f++) {
        const key = LEG_KEYS[f];
        const r = Lg[key].rest;
        const order = key === 'FL' ? 0 : 0.18;
        const out = ramp(t, 0.15 + order, 0.5 + order);
        const back = ramp(t, 2.55 + order, 2.85 + order);
        const q = out * (1 - back);
        const stepping = bump(t, 0.15 + order, 0.5 + order) + bump(t, 2.55 + order, 2.85 + order);
        lg[key] = set3(tp.legAt[key], r[0], r[1] + 0.014 * stepping, r[2] + 0.085 * q);
      }
      const tl = (tp.tail = tp.tailPlan);
      for (let i = 0; i < 5; i++) {
        tl[i][0] = TAIL_STRETCH[i] * low + quiver;
        tl[i][1] = Math.sin(t * 2 - i) * 0.05;
      }
      tl.w = low;
      if (!tr.mew && t > 1.3) {
        tr.mew = true;
        this.emit('sound', { name: 'mew' });
      }
      if (!tr.happy && t > 2.4) {
        tr.happy = true;
        this.emit('sparkle', { at: this.bonePoint('head', [0, 0.06, 0.02]), count: 20, colors: SPARKS, up: 0.6, speed: 0.4, size: 0.018 });
      }
    } else if (tr.name === 'roll') {
      // flops over onto its back, paws up, wriggles and purrs, rolls back
      const over = keys(t, ROLL_K);
      const onBack = smooth(clamp((over - 1.6) / 0.9, 0, 1));
      const wriggle = ramp(t, 1.1, 1.3) * (1 - ramp(t, 2.3, 2.5));
      // the lowest point of the body as it turns over
      const low = Math.sqrt(Math.pow(0.042 * Math.sin(over), 2) + Math.pow(0.046 * Math.cos(over), 2));
      const down = smooth(clamp(over / 1.1, 0, 1));
      tp.roll = over + Math.sin(t * TAU * 1.7) * 0.12 * wriggle;
      tp.y = lerp(0, low + 0.006 - 0.09, down) - 0.008 * bump(t, 0, 0.4);
      tp.yaw = Math.sin(t * TAU * 1.7 + 1) * 0.08 * wriggle;
      tp.ik = 1 - down;
      // upside down, it looks back at you
      tp.head[2] = -0.9 * onBack + Math.sin(t * 3) * 0.12 * wriggle;
      tp.neck[2] = -0.4 * onBack;
      this.planEars(tp, 0.2, -0.2, down);
      tp.squint = 0.9 * wriggle;
      const tl = (tp.tail = tp.tailPlan);
      for (let i = 0; i < 5; i++) {
        tl[i][0] = 0.1;
        tl[i][1] = Math.sin(t * 4 - i * 0.7) * 0.35 * wriggle + 0.2;
      }
      tl.w = down;
      // paws in the air, batting and kneading, posed after the rest
      tp.after = 'roll';
      tp.a = t;
      tp.b = down;
      tp.c = wriggle;
      if (!tr.flop && t > 0.6) {
        tr.flop = true;
        this.emit('sound', { name: 'flop' });
      }
      if (!tr.purr && t > 1.15) {
        tr.purr = true;
        this.emit('sound', { name: 'purr' });
        this.emit('sparkle', { at: this.worldCenter(), count: 26, colors: SPARKS, up: 0.9, speed: 0.5, size: 0.02 });
      }
      if (!tr.happy && t > 3.0) {
        tr.happy = true;
        this.emit('sound', { name: 'happy' });
      }
    }
  }

  // ear and leg plans for a trick, filled in place
  planEars(tp, yaw, pitch, w) {
    for (const E of tp.earPlan) {
      E.yaw = yaw;
      E.pitch = pitch;
      E.w = w;
    }
    tp.ears = tp.earPlan;
  }

  planLegs(tp) {
    const lg = tp.legPlan;
    lg.FL = lg.FR = lg.HL = lg.HR = null;
    tp.legs = lg;
    return lg;
  }

  // what a trick poses after the rest of the pose
  afterPose(tp) {
    const B = this.bones;
    const t = tp.a;
    if (tp.after === 'pounce') {
      const wig = tp.b;
      const peek = tp.c;
      B.hips.rotation.z += Math.sin(t * TAU * 5) * 0.14 * wig;
      B.hips.position.x += Math.sin(t * TAU * 5) * 0.004 * wig;
      if (peek > 0) addPose(B.pawL, -0.6 * peek, 0, 0);
    } else if (tp.after === 'roll') {
      const w = tp.b;
      const wriggle = tp.c;
      for (let i = 0; i < 2; i++) {
        const sd = i === 0 ? 1 : -1;
        const bat = Math.sin(t * TAU * 2.2 + (sd > 0 ? 0 : 1.6)) * wriggle;
        const kick = Math.sin(t * TAU * 1.7 + (sd > 0 ? 1 : 2.4)) * wriggle;
        pose(B[ARM[i]], lerp(B[ARM[i]].rotation.x, -0.9 + bat * 0.35, w), 0, lerp(0, sd * -0.25, w));
        pose(B[FORE[i]], lerp(B[FORE[i]].rotation.x, 0.9 + bat * 0.4, w), 0, 0);
        pose(B[PAW[i]], lerp(B[PAW[i]].rotation.x, 0.6 + bat * 0.3, w), 0, 0);
        pose(B[THIGH[i]], lerp(B[THIGH[i]].rotation.x, -0.7 + kick * 0.3, w), 0, lerp(0, sd * -0.3, w));
        pose(B[SHIN[i]], lerp(B[SHIN[i]].rotation.x, 0.9 + kick * 0.25, w), 0, 0);
        pose(B[FOOT[i]], lerp(B[FOOT[i]].rotation.x, -0.2, w), 0, 0);
      }
    }
  }

  // a world point on the ground under the kitten (or under p)
  groundPoint(lift = 0, p = null) {
    const g = this.object.getWorldPosition(new THREE.Vector3());
    const out = p ? p.clone() : this.worldCenter();
    out.y = g.y + lift;
    return out;
  }

  trickLength(name) {
    return { pounce: 3.1, stretch: 3.3, roll: 3.6 }[name] || 2;
  }
}

// ------------------------------------------------------------ sounds

// a purr: soft low rumbling pulses
function purr(a, t, dur = 1.4, v = 0.07) {
  const ctx = a.ctx;
  const n = ctx.createBufferSource();
  n.buffer = a.pink;
  n.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const am = ctx.createGain();
  am.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 24;
  const depth = ctx.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(am.gain);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.15);
  g.gain.setValueAtTime(v, t + dur - 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(lp).connect(am).connect(g).connect(a.sfx);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 96;
  const og = ctx.createGain();
  og.gain.value = 0.35;
  o.connect(og).connect(am);
  n.start(t, Math.random());
  n.stop(t + dur + 0.05);
  o.start(t);
  o.stop(t + dur + 0.05);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

export const calls = {
  // a trilling 'mrrp' and a tiny bell
  happy: (a, t) => {
    glide(a, t, [[0, 520], [0.07, 720], [0.18, 640]], { v: 0.1, formant: 850, q: 1.0, trill: 24, trillDepth: 0.6, breath: 0.3 });
    a.bell(2349, 0.03, t + 0.22, 0.5);
  },
  // a soft kitten mew, yawning
  mew: (a, t) => {
    glide(a, t, [[0, 640], [0.12, 1050], [0.34, 920], [0.58, 700]], { v: 0.11, formant: 1500, q: 1.8, vibrato: 10, breath: 0.25, attack: 0.04 });
  },
  // a whoosh and a little 'prrt'
  pounce: (a, t) => {
    puff(a, t, { v: 0.06, from: 400, to: 1800, dur: 0.35 });
    glide(a, t + 0.05, [[0, 900], [0.06, 1400], [0.14, 1250]], { v: 0.08, formant: 1500, trill: 30, trillDepth: 0.6 });
    [1760, 2349].forEach((f, i) => a.bell(f, 0.026, t + 0.42 + i * 0.08, 0.5));
  },
  flop: (a, t) => {
    puff(a, t, { v: 0.12, from: 220, to: 520, dur: 0.25 });
  },
  purr: (a, t) => {
    purr(a, t);
    a.bell(2093, 0.022, t + 0.2, 0.6);
  },
};
