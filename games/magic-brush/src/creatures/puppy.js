// Biscuit, a puppy: a big round head, huge brown eyes, long floppy velvet
// ears, a cream muzzle with soft jowls and a big shiny button nose, a
// chubby body with a cream bib, big paws in cream socks with dark pads and
// a short tail that never stops wagging. Soft short fur carries the
// child's colours; the muzzle, bib, belly and socks stay creamy.
//
// Trots on planted feet (two-bone IK, diagonal pairs), sits down when it
// has been still a while, pants with its tongue out now and then and tilts
// its head, curious. The ears swing on springs with every bounce and turn;
// the tail wags faster the happier it is.
//
// Tricks: 'bow' (a play bow, bottom up and tail going, two soft yips, then
// springs up), 'spin' (spots its tail and chases it round twice, then a
// dizzy wobble) and 'beg' (sits, sits up on its haunches, waves a paw).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, frameFrom } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { hideMaterial } from './materials.js';
import { pose, bump, ramp, smooth, Spring, TAU, clamp, lerp, twoBone, Bend } from './anim.js';
import { glide, puff } from '../sound/calls.js';
import { Tracker, Gait } from './pal-kit.js';

const COAT = 0xd9a066;
const CREAM = 0xfff1dc;
const EARS = 0x6b4428;
const NOSE = 0x2a1d1a;
const PAD = 0x4a3230;
const MOUTH = 0x3a2224;
const MOUTH_IN = 0x4a1620;
const TONGUE = 0xf07d92;
const SPARKS = [[2.0, 1.6, 0.8], [1.9, 1.2, 1.5], [1.3, 1.8, 2.0], [1.9, 1.8, 1.2]];

const HEAD_C = [0, 0.17, 0.08];
const HEAD_R = [0.064, 0.058, 0.058];
const EYE = [0.0288, 0.1818, 0.1203];
const EYE_DIR = [0.38, 0.1, 1];
const EYE_R = 0.0195;
const NOSE_C = [0, 0.158, 0.166];
// the top middle of the mouth, under the nose
const MOUTH_AT = [0, 0.14, 0.161];
// where the tongue hangs from (behind the lower lip)
const TONGUE_AT = [0, 0.1365, 0.156];
// a floppy ear, from the root on top of the head to the tip by the cheek
const EAR = [[0.051, 0.206, 0.07], [0.067, 0.182, 0.071], [0.072, 0.153, 0.072], [0.071, 0.124, 0.073]];
// the tail, from the root, curving up
const TAIL = [[0, 0.115, -0.096], [0, 0.132, -0.122], [0, 0.156, -0.137], [0, 0.182, -0.139]];
// legs: [upper, lower, paw] bone rest positions (left side)
const FRONT = [[0.03, 0.105, 0.05], [0.032, 0.062, 0.036], [0.032, 0.021, 0.056]];
const HIND = [[0.034, 0.1, -0.062], [0.037, 0.058, -0.044], [0.037, 0.021, -0.072]];

const V = (a) => new THREE.Vector3(...a);

// Per-frame tables, made once (animate() allocates nothing)
const GAIT = { FL: 0, HR: 0.03, FR: 0.5, HL: 0.53 };
const SPIN_ORDER = { FL: 0, HR: 0.5, FR: 0.5, HL: 0 };
const LEG_KEYS = ['FL', 'FR', 'HL', 'HR'];
const ARM = ['armL', 'armR'];
const FORE = ['foreL', 'foreR'];
const PAW = ['pawL', 'pawR'];
const THIGH = ['thighL', 'thighR'];
const SHIN = ['shinL', 'shinR'];
const FOOT = ['footL', 'footR'];
const EAR0 = ['ear0L', 'ear0R'];
const EAR1 = ['ear1L', 'ear1R'];
const EAR2 = ['ear2L', 'ear2R'];
const TAIL_B = ['tail0', 'tail1', 'tail2'];
const TAIL_WAG = [1, 0.6, 0.4];
const TAIL_LIFT = [0, 0.05, 0];
const EYE_PARTS = [['eyeL', 'lidL', 'shutL', 'joyL'], ['eyeR', 'lidR', 'shutR', 'joyR']];
const SHUT = ['shutL', 'shutR'];
const JOY = ['joyL', 'joyR'];
const YIPS = [0.8, 1.35];
const YIP_FLAG = ['yip0', 'yip1'];

// an ellipsoid between a and b (radii: across, along, the other way), its
// first axis turned towards `out`
function set3(a, x, y, z) {
  a[0] = x;
  a[1] = y;
  a[2] = z;
  return a;
}

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

// Parts that only show now and then (the open mouth, the tongue, the
// closed-eye lines) are modelled shrunk to a speck round their bone and
// scaled up by 1 / TINY when shown, so the rest pose (which is what lies flat
// on the canvas before the friend comes alive) has none of them.
const TINY = 0.01;
function tiny(g, c) {
  return g.translate(-c[0], -c[1], -c[2]).scale(TINY, TINY, TINY).translate(c[0], c[1], c[2]);
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

export class Puppy extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.furry = true;
    this.hideOpts = { sheen: 0.8, clearcoat: 0.9 };
    this.voxelScale = 0.85;
    this.walkSpeed = 0.3;
    this.turnRate = 2.8;
    this.hopScale = 1.1;
    this.shared.uFurLen.value = 0.0076;
    this.shared.uStrand.value = 0.0016;
    this.shared.uComb.value.set(0, -0.25, -0.6);
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
    this.headYaw = new Spring(0, 1.9, 0.72);
    this.headPitch = new Spring(0, 1.9, 0.72);
    this.tilt = new Spring(0, 1.4, 0.55);
    this.tiltT = 3;
    this.tiltTo = 0;
    // floppy ears: pendulums (swing out/in, forwards/back)
    this.ears = [0, 1].map(() => ({ swing: new Spring(0, 1.6, 0.18), fwd: new Spring(0, 1.5, 0.2), flop: new Spring(0, 2.2, 0.25) }));
    this.wagAmt = new Spring(0.3, 1.2, 0.8);
    this.wagPh = 0;
    this.tailS = [0, 1, 2].map((i) => new Spring(0, 2.4 - i * 0.3, 0.3));
    this.pantT = 2;
    this.panting = false;
    this.pant = 0;
    this.prevYaw = null;
    this.shut = 0;
    this.joy = 0;
    // the trick plan, reused every frame
    this.tp = {
      y: 0, z: 0, pitch: 0, roll: 0, yaw: 0, sq: 0, squint: 0, head: [0, 0, 0], neck: [0, 0, 0], jaw: 0, open: null, legs: null, ik: 1, wag: null, sit: null, chestY: 0, hipsY: 0, hipsRx: 0, chestRx: 0, chestRy: 0, hipsRy: 0, feetYaw: 0,
      ears: null, fling: 0, tongue: null, tailUp: 0, after: null, a: 0, b: 0, c: 0,
      legPlan: { FL: null, FR: null, HL: null, HR: null },
      legAt: { FL: [0, 0, 0], FR: [0, 0, 0], HL: [0, 0, 0], HR: [0, 0, 0] },
    };
    // (scratch for the head's acceleration)
    this._hp = new THREE.Vector3();
    this._pp = new THREE.Vector3();
    this._pv = new THREE.Vector3();
    this._hv = new THREE.Vector3();
    this._acc = new THREE.Vector3();
    this._accOn = false;
    const blink = this.blinker.update.bind(this.blinker);
    this.blinker.update = (dt) => (this.shut = blink(dt));
  }

  get tricks() {
    return ['bow', 'spin', 'beg'];
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
    s.bone('root', null, [0, 0.096, 0]);
    s.bone('chest', 'root', [0, 0.1, 0.032]);
    s.bone('hips', 'root', [0, 0.097, -0.05]);
    s.bone('neck', 'chest', [0, 0.125, 0.06]);
    s.bone('head', 'neck', [0, 0.15, 0.075]);
    s.bone('jaw', 'head', [0, 0.142, 0.104]);
    s.bone('mouth', 'head', MOUTH_AT);
    s.bone('tongue', 'jaw', TONGUE_AT);
    this.eyeBones(s, EYE);
    s.bones2('shut', 'head', EYE);
    s.bones2('joy', 'head', EYE);
    s.bones2('ear0', 'head', EAR[0]);
    s.bones2('ear1', 'ear0', EAR[1]);
    s.bones2('ear2', 'ear1', EAR[2]);
    s.bone('tail0', 'hips', TAIL[0]);
    s.bone('tail1', 'tail0', TAIL[1]);
    s.bone('tail2', 'tail1', TAIL[2]);
    s.bones2('arm', 'chest', FRONT[0]);
    s.bones2('fore', 'arm', FRONT[1]);
    s.bones2('paw', 'fore', FRONT[2]);
    s.bones2('thigh', 'hips', HIND[0]);
    s.bones2('shin', 'thigh', HIND[1]);
    s.bones2('foot', 'shin', HIND[2]);

    const coat = { paint: 0.95, fur: 1, rough: 0.8, pat: 0, tint: COAT };
    const cream = { paint: 0.3, fur: 1.1, rough: 0.8, tint: CREAM };
    s.setLook(coat);
    // a chubby body with a cream belly and bib
    s.ellipsoid([0, 0.1, 0.032], [0.046, 0.05, 0.05], { bone: 'chest', k: 0.04 });
    s.ellipsoid([0, 0.097, -0.05], [0.047, 0.049, 0.054], { bone: 'hips', k: 0.04 });
    s.ellipsoid([0, 0.078, -0.006], [0.037, 0.028, 0.06], { bone: 'root', k: 0.03, ...cream, paint: 0.35 });
    s.ellipsoid([0, 0.108, 0.07], [0.03, 0.04, 0.02], { bone: 'chest', k: 0.025, ...cream, fur: 1.3 });
    s.cone([0, 0.115, 0.05], [0, 0.145, 0.07], 0.034, 0.032, { bone: 'neck', k: 0.03 });
    // the head: big and round, a cream muzzle with soft jowls, a big shiny
    // nose, cream eyebrow dots
    const head = { bone: 'head', fur: 0.7 };
    s.ellipsoid(HEAD_C, HEAD_R, { ...head, k: 0.03 });
    s.ellipsoid([0, 0.146, 0.13], [0.032, 0.026, 0.034], { ...head, k: 0.02, ...cream, paint: 0.35, fur: 0.62 });
    s.sphere([0.015, 0.14, 0.146], 0.016, { ...head, k: 0.012, sym: true, ...cream, paint: 0.35, fur: 0.5 });
    s.ellipsoid([0, 0.126, 0.138], [0.017, 0.009, 0.015], { bone: 'jaw', k: 0.012, ...cream, paint: 0.35, fur: 0.6 });
    s.ellipsoid(NOSE_C, [0.0125, 0.009, 0.0085], { ...head, k: 0.005, tint: NOSE, paint: 0, fur: 0, rough: 0.22 });
    s.sphere([0.0045, NOSE_C[1] - 0.0015, NOSE_C[2] + 0.0082], 0.0022, { ...head, k: 0.002, sub: true, sym: true, tint: 0x0a0706, paint: 0, fur: 0, rough: 0.5 });
    s.ellipsoid([0.023, 0.2025, 0.119], [0.0075, 0.0048, 0.005], { ...head, k: 0.004, sym: true, ...cream, paint: 0.35, fur: 0.5 });
    ring(s, EYE, EYE_DIR, EYE_R * 0.5, EYE_R * 0.93, 0.002, { ...head, k: 0.006, sym: true, fur: 0.45 });
    // long floppy ears hanging by the cheeks, velvety, a little darker
    const ear = { sym: true, k: 0.005, fur: 0.75, tint: EARS, paint: 0.8 };
    s.ellipsoid([0.055, 0.201, 0.07], [0.011, 0.009, 0.017], { ...ear, k: 0.01, bone: 'ear0L' });
    span(s, EAR[0], EAR[1], [0.0072, 0.019, 0.018], [1, 0, 0], { ...ear, bone: 'ear0L', at: 0.55 });
    span(s, EAR[1], EAR[2], [0.0066, 0.019, 0.022], [1, 0, 0], { ...ear, bone: 'ear1L' });
    span(s, EAR[2], EAR[3], [0.006, 0.018, 0.022], [1, 0, 0], { ...ear, bone: 'ear2L', at: 0.35 });
    // a short tail, curving up, with a cream tip
    s.chain(TAIL, [0.014, 0.012, 0.0095, 0.006], { bones: ['tail0', 'tail1', 'tail2'], k: 0.012, fur: 1.2 });
    s.sphere(TAIL[3], 0.007, { bone: 'tail2', k: 0.01, ...cream, paint: 0.3, fur: 1.3 });
    // legs: chunky, big paws in cream socks
    const leg = { sym: true, fur: 0.8 };
    s.cone(FRONT[0], FRONT[1], 0.022, 0.017, { ...leg, bone: 'armL', k: 0.025 });
    s.cone(FRONT[1], FRONT[2], 0.017, 0.0155, { ...leg, bone: 'foreL', k: 0.012 });
    s.ellipsoid([0.036, 0.084, -0.06], [0.023, 0.034, 0.037], { ...leg, bone: 'thighL', k: 0.03, fur: 1 });
    s.cone(HIND[1], HIND[2], 0.016, 0.015, { ...leg, bone: 'shinL', k: 0.014 });
    const sock = { ...leg, ...cream, sym: true, paint: 0.45, fur: 0.7 };
    for (const [x, z, bone] of [[0.032, 0.066, 'pawL'], [0.037, -0.061, 'footL']]) {
      s.ellipsoid([x, 0.0118, z], [0.019, 0.0118, 0.022], { ...sock, bone, k: 0.012 });
      for (const dx of [-0.0085, 0, 0.0085]) s.sphere([x + dx, 0.0105, z + 0.015 - Math.abs(dx) * 0.35], 0.0068, { ...sock, bone, k: 0.004 });
      s.ellipsoid([x, 0.0035, z - 0.003], [0.0068, 0.0035, 0.006], { bone, k: 0.002, sym: true, tint: PAD, paint: 0, fur: 0, rough: 0.5 });
      for (const dx of [-0.0085, 0, 0.0085]) s.sphere([x + dx, 0.0035, z + 0.0145 - Math.abs(dx) * 0.35], 0.0032, { bone, k: 0.002, sym: true, tint: PAD, paint: 0, fur: 0, rough: 0.5 });
    }
  }

  parts(s) {
    const I = s.index;
    const geo = this.body.geometry;
    this.addEyes(s, {
      c: EYE,
      r: EYE_R,
      dir: EYE_DIR,
      iris: 0x8a5630,
      iris2: 0x3a2212,
      irisSize: 0.98,
      pupil: 0.55,
      lid: { tint: 0x5a3a24, paint: 0.8, fur: 0.75, rough: 0.8, open: -0.55, closed: 1.45 },
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
    // the mouth: a line down from the nose, curving out along the jowls
    const on = (p) => onSurface(geo, p, 0.0016);
    const mouth = [tubeGeometry([[0, 0.1495, 0.1675], [0, 0.1455, 0.1658], [0, 0.1415, 0.163]].map(on), [0.0011, 0.0011, 0.001], { radial: 6, steps: 8 })];
    for (const sd of [1, -1]) mouth.push(tubeGeometry([[0, 0.1415, 0.163], [0.006 * sd, 0.1385, 0.1605], [0.0115 * sd, 0.1388, 0.1565], [0.0165 * sd, 0.141, 0.1505]].map(on), [0.001, 0.001, 0.0009, 0.0006], { radial: 6, steps: 12 }));
    this.addMesh(bindTo(mergeGeometries(mouth.map((g) => withLook(g, { tint: MOUTH, rough: 0.5 }))), I.head), this.mat('solid'), { shadow: false }).userData.noProject = true;
    // the open mouth: a dark rosy opening under the smile, bent round the
    // muzzle, grown down from the upper lip (flat and hidden when closed)
    const m0 = onSurface(geo, [0, MOUTH_AT[1] - 0.0065, MOUTH_AT[2]], 0.0);
    const mc = [0, MOUTH_AT[1] - 0.0065, m0[2] + 0.0014];
    const inside = new THREE.SphereGeometry(1, 28, 16);
    inside.scale(0.0142, 0.0068, 0.0026);
    const ip = inside.attributes.position;
    for (let i = 0; i < ip.count; i++) {
      const x = ip.getX(i), y = ip.getY(i);
      // the top edge follows the smile: up at the corners
      ip.setY(i, y + (y > 0 ? 0.0028 * (x / 0.0142) ** 2 : 0.0012 * (x / 0.0142) ** 2));
      ip.setZ(i, ip.getZ(i) - (x * x) / (2 * 0.03));
    }
    inside.computeVertexNormals();
    inside.translate(...mc);
    tiny(inside, MOUTH_AT);
    withLook(inside, { tint: MOUTH_IN, rough: 0.55 });
    inside.deleteAttribute('uv');
    bindTo(inside, I.mouth);
    // the tongue: out over the lower lip, then hanging down, broad and flat
    // (a tube down the middle plane, widened sideways)
    const tongue = tubeGeometry([[0, 0.1372, 0.1565], [0, 0.1348, 0.1625], [0, 0.1298, 0.1648], [0, 0.1228, 0.1652], [0, 0.1168, 0.1632]], [0.0024, 0.0027, 0.0029, 0.0028, 0.0023], { radial: 14, steps: 20 });
    tongue.scale(2.7, 1, 1);
    tongue.computeVertexNormals();
    tiny(tongue, TONGUE_AT);
    withLook(tongue, { tint: TONGUE, rough: 0.3 });
    bindTo(tongue, I.tongue);
    this.addMesh(mergeGeometries([inside, tongue]), this.mat('solid', { clearcoat: 0.7 }), { shadow: false }).userData.noProject = true;
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

    const yawRate = this.prevYaw === null || dt <= 0 ? 0 : clamp(Math.atan2(Math.sin(this.object.rotation.y - this.prevYaw), Math.cos(this.object.rotation.y - this.prevYaw)) / dt, -4, 4);
    this.prevYaw = this.object.rotation.y;

    // ---- trick plan: fills tp, may pose extra bones after the rest
    const tp = this.tp;
    tp.y = tp.z = tp.pitch = tp.roll = tp.yaw = tp.sq = tp.squint = tp.jaw = 0;
    tp.chestY = tp.hipsY = tp.hipsRx = tp.chestRx = tp.chestRy = tp.hipsRy = tp.feetYaw = 0;
    tp.fling = tp.tailUp = 0;
    tp.head[0] = tp.head[1] = tp.head[2] = 0;
    tp.neck[0] = tp.neck[1] = tp.neck[2] = 0;
    tp.ik = 1;
    tp.open = tp.legs = tp.wag = tp.sit = tp.ears = tp.tongue = tp.after = null;
    if (doing) this.trickPlan(tr, dt, tp);

    // ---- sitting down when it has been still a while
    const still = m.speed < 0.01 && !doing && air === 0 && Math.abs(yawRate) < 0.3;
    this.stillT = still ? this.stillT + dt : 0;
    if (!this.sitting && this.stillT > 3 && Math.random() < dt * 0.4) this.sitting = true;
    if (!still) this.sitting = false;
    const sit = clamp(this.sit.update(tp.sit ?? (this.sitting ? 1 : 0), dt), 0, 1.05);

    // ---- the gait: a bouncy trot on planted feet, diagonal pairs
    const pace = clamp(m.speed / this.walkSpeed, 0, 1.3);
    const moveAmt = Math.max(pace, clamp(Math.abs(yawRate) / 1.5, 0, 0.5)) * (air > 0 ? 0 : 1) * (doing ? 0 : 1);
    this.stepAmt += ((moveAmt > 0.03 ? 1 : 0) - this.stepAmt) * (1 - Math.exp(-dt * 6));
    const hz = lerp(1.8, 2.7, clamp(pace, 0, 1)) * 0.8; // (a slower cadence with longer strides steps more smoothly)
    this.phase += dt * hz;
    const D = 0.55;
    const lift = 0.022 * clamp(pace * 1.4, 0.35, 1) * this.stepAmt;
    // a foot on the ground stays where it landed (the ground carries it back)
    const gait = (this.gait ??= new Gait(4));
    gait.begin(this.track.update(this.object, dt), air, dt);
    for (let i = 0; i < 4; i++) {
      const k = LEG_KEYS[i];
      const L = this.legs[k];
      gait.step(i, this.phase + GAIT[k], D, hz, lift, 0.013, _gs);
      L.target.set(L.rest[0], L.rest[1] + _gs[1], L.rest[2] + _gs[0]);
      L.lift = _gs[1] / 0.02;
    }

    // ---- panting now and then when resting: mouth open, tongue out
    this.pantT -= dt;
    if (this.pantT <= 0) {
      this.panting = !this.panting && Math.random() < 0.7;
      this.pantT = this.panting ? 2 + Math.random() * 3 : 1.5 + Math.random() * 3;
    }
    // (never while still pressed flat as paint or leaping off the canvas)
    const pantOn = (this.panting || this.stepAmt > 0.5) && !doing && air === 0 && this.shared.uFront.value < 0 ? 1 : 0;
    this.pant += (pantOn - this.pant) * (1 - Math.exp(-dt * 5));

    // ---- body: a bouncy bob, fast breathing when panting
    const bob = Math.abs(Math.sin(this.phase * TAU)) * 0.005 * this.stepAmt;
    const breathe = lerp(Math.sin(t * TAU * 0.6), Math.sin(t * TAU * 3.2), this.pant);
    let rx = -0.03 * pace + tp.pitch - 0.12 * sit;
    root.position.y += bob - 0.006 * this.stepAmt + tp.y;
    root.position.z += tp.z;
    root.rotation.set(rx, tp.yaw + Math.sin(this.phase * TAU) * 0.04 * this.stepAmt, tp.roll + Math.sin(this.phase * TAU) * 0.035 * this.stepAmt);
    const sq = tp.sq;
    root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    B.chest.scale.set(1 + breathe * 0.012, 1 + breathe * (0.016 + 0.006 * this.pant), 1 + breathe * 0.01);
    B.hips.position.y += -0.038 * sit + tp.hipsY;
    B.hips.position.z += 0.012 * sit;
    pose(B.hips, -0.55 * sit + tp.hipsRx, tp.hipsRy, 0);
    B.chest.position.y += tp.chestY;
    pose(B.chest, -0.22 * sit + tp.chestRx, tp.chestRy, 0);

    // ---- legs: planted by IK; sitting folds the hind legs under
    if (sit > 0.001) {
      for (const k of LEG_KEYS) {
        const L = this.legs[k];
        L.target.z = lerp(L.target.z, L.rest[2] + (k[0] === 'H' ? 0.03 : 0.004), sit);
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
      const parentRx = k[0] === 'F' ? B.chest.rotation.x : B.hips.rotation.x;
      L.solve(root.rotation.x + parentRx, ik);
    }
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

    // ---- head: looks about, the curious puppy head tilt
    let yaw = Math.sin(t * 0.37 + 2) * 0.35 + Math.sin(t * 0.14) * 0.2;
    let hpitch = Math.sin(t * 0.29) * 0.08;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z - 0.08), -0.9, 0.9);
      hpitch = clamp(-Math.atan2(this.lookLocal.y - 0.17, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.45, 0.35);
    }
    this.tiltT -= dt;
    if (this.tiltT <= 0) {
      this.tiltTo = this.tiltTo !== 0 || Math.random() < 0.4 ? 0 : (Math.random() < 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.15);
      this.tiltT = this.tiltTo !== 0 ? 1.2 + Math.random() * 1.2 : 1.5 + Math.random() * 3;
    }
    const tilt = this.tilt.update(this.tiltTo * (1 - this.stepAmt), dt);
    const hy = this.headYaw.update(yaw * (1 - this.stepAmt * 0.6), dt);
    const hp = this.headPitch.update(hpitch - rx * 0.8 - B.chest.rotation.x * 0.8, dt);
    pose(B.neck, hp * 0.35 + tp.neck[0], hy * 0.35 + tp.neck[1], tp.neck[2]);
    const headRoll = tilt + Math.sin(t * 0.45) * 0.05 + tp.head[2];
    pose(B.head, hp * 0.65 - Math.sin(this.phase * TAU * 2) * 0.035 * this.stepAmt + tp.head[0], hy * 0.65 + tp.head[1], headRoll);
    const open = tp.open ?? this.pant * (0.72 + 0.12 * Math.sin(t * TAU * 3.2));
    pose(B.jaw, open * 0.25 + tp.jaw, 0, 0);
    const shown = smooth(open / 0.06);
    B.mouth.scale.set(Math.max(1e-4, shown * (0.8 + 0.2 * open)) / TINY, Math.max(1e-4, open) / TINY, Math.max(1e-4, shown) / TINY);
    // the tongue: out when panting (or when a trick says so), bobbing
    const tongue = clamp(tp.tongue ?? this.pant, 0, 1);
    B.tongue.scale.setScalar(Math.max(1e-4, smooth(tongue) * clamp(open * 2.5, 0, 1)) / TINY);
    pose(B.tongue, -open * 0.25 + Math.sin(t * TAU * 3.2) * 0.08 * this.pant, 0, 0);

    // ---- floppy ears: they hang (whatever the head does) and swing with
    // every bounce and turn
    const acc = this.headAccel(dt);
    const headRx = B.head.rotation.x + B.neck.rotation.x + B.chest.rotation.x + root.rotation.x;
    for (let i = 0; i < 2; i++) {
      const e = this.ears[i];
      const side = i === 0 ? 1 : -1;
      const G = 9;
      // (swing: + is out from the head; fwd: + is the tip going back)
      e.swing.kick(-acc.x * side * dt * G - acc.y * dt * 3);
      e.fwd.kick(acc.z * dt * G);
      e.flop.kick(-acc.y * dt * G * 0.6);
      const sw = Math.max(-0.12, e.swing.update(-(headRoll + root.rotation.z) * side * 0.8 - yawRate * side * 0.08 + 0.02 + tp.fling, dt));
      const fw = e.fwd.update(-headRx * 0.8 + 0.05 * this.stepAmt, dt);
      const fl = e.flop.update(0, dt);
      const ew = tp.ears ? tp.ears[i] : null;
      pose(B[EAR0[i]], fw + (ew ? ew[0] : 0), 0, (sw + (ew ? ew[1] : 0)) * side);
      pose(B[EAR1[i]], fw * 0.3, 0, (fl * 0.6 + sw * 0.2) * side);
      pose(B[EAR2[i]], fw * 0.3, 0, (fl * 0.8 + sw * 0.2) * side);
    }

    // ---- tail: wags, faster and wider when happy
    const excited = clamp(this.stepAmt * 0.6 + (this.lookLocal ? 0.4 : 0) + this.happy.x * 0.4 + (tp.wag ?? 0), 0.15, 1.3);
    const wa = this.wagAmt.update(excited, dt);
    this.wagPh += dt * TAU * lerp(2.2, 7, clamp(wa, 0, 1));
    const wag = Math.sin(this.wagPh) * lerp(0.15, 0.75, clamp(wa, 0, 1.2));
    for (let i = 0; i < 3; i++) {
      const s = this.tailS[i].update(wag * TAIL_WAG[i], dt);
      // (sitting, it lies on the ground curled to one side and sweeps it)
      if (i === 0) pose(B.tail0, 0.1 + 0.15 * sit + tp.tailUp, wag * (1 - 0.4 * sit) + 0.7 * sit, 0);
      else pose(B[TAIL_B[i]], TAIL_LIFT[i] + 0.35 * sit, 0, s * (1 - 0.5 * sit) - 0.25 * sit);
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

  // the acceleration of the top of the head in the puppy's own space
  // (smoothed a little), for the ears' swing
  headAccel(dt) {
    const B = this.bones;
    this.object.updateMatrixWorld();
    const p = B.head.localToWorld(this._hp.set(0, 0.05, 0));
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

  trickPlan(tr, dt, tp) {
    const t = tr.t;
    const Lg = this.legs;
    if (tr.name === 'bow') {
      // the play bow: front down, bottom up, tail going; two little yips
      const bow = ramp(t, 0.05, 0.45) * (1 - ramp(t, 1.95, 2.35));
      const bounce = Math.max(0, Math.sin((t - 0.55) * TAU * 1.8)) * ramp(t, 0.55, 0.7) * (1 - ramp(t, 1.7, 1.9));
      const yips = YIPS;
      let yip = 0;
      for (const T of yips) yip = Math.max(yip, bump(t, T - 0.05, T + 0.22));
      const up = bump(t, 2.0, 2.45);
      tp.chestY = -0.056 * bow + 0.01 * bounce;
      tp.chestRx = 0.34 * bow;
      tp.hipsRx = -0.2 * bow;
      tp.hipsY = 0.016 * bow;
      tp.pitch = 0.12 * bow;
      tp.y = 0.03 * up;
      tp.sq = -0.05 * up;
      tp.neck[0] = -0.3 * bow - 0.2 * yip;
      tp.head[0] = 0.1 * bow - 0.25 * yip;
      tp.open = Math.max(0.25 * bow, yip);
      tp.wag = 1;
      tp.tailUp = 0.5 * bow;
      tp.squint = 0.9 * ramp(t, 2.05, 2.15) * (1 - ramp(t, 2.45, 2.55));
      tp.tongue = 0;
      const lg = this.planLegs(tp);
      for (let f = 0; f < 2; f++) {
        const key = LEG_KEYS[f];
        const r = Lg[key].rest;
        lg[key] = set3(tp.legAt[key], r[0] * 1.15, r[1] + 0.01 * bounce, r[2] + 0.052 * bow);
      }
      for (let n = 0; n < yips.length; n++) {
        if (!tr[YIP_FLAG[n]] && t > yips[n]) {
          tr[YIP_FLAG[n]] = true;
          this.emit('sound', { name: 'yip' });
          this.emit('sparkle', { at: this.bonePoint('head', [0, -0.01, 0.1]), count: 12, colors: SPARKS, up: 0.5, speed: 0.5, size: 0.016 });
          this.happy.kick(2);
        }
      }
      if (!tr.happy && t > 2.1) {
        tr.happy = true;
        this.emit('sound', { name: 'happy' });
      }
    } else if (tr.name === 'spin') {
      // spots its own tail and chases it round and round, then a dizzy wobble
      const look = ramp(t, 0, 0.3) * (1 - ramp(t, 2.0, 2.3));
      const u = clamp((t - 0.3) / 1.8, 0, 1);
      const turns = smooth(u) * 2;
      const w = (2 * TAU * 6 * u * (1 - u)) / 1.8;
      tp.fling = Math.min(0.6, w * w * 0.005);
      tp.tongue = look;
      const spinning = t > 0.3 && t < 2.1 ? 1 : 0;
      const dizzy = bump(t, 2.05, 2.9);
      tp.yaw = turns * TAU;
      tp.chestRy = 0.35 * look;
      tp.hipsRy = -0.3 * look;
      tp.neck[1] = 0.5 * look;
      tp.head[1] = 0.6 * look + Math.sin(t * 9) * 0.15 * dizzy;
      tp.head[2] = Math.sin(t * 7) * 0.25 * dizzy;
      tp.roll = Math.sin(t * 6) * 0.06 * dizzy + 0.08 * spinning;
      tp.open = 0.5 * look;
      tp.wag = 1.2;
      // a dizzy, happy squint, eased open again before the end
      tp.squint = 0.85 * ramp(t, 2.3, 2.45) * (1 - ramp(t, 2.7, 2.95));
      // the feet patter round with the body
      const lg = this.planLegs(tp);
      const a = turns * TAU;
      const c = Math.cos(a), sn = Math.sin(a);
      for (const key of LEG_KEYS) {
        // the feet turn with the body, pattering
        const r = Lg[key].rest;
        const step = Math.max(0, Math.sin((t * 4.5 + SPIN_ORDER[key]) * TAU)) * 0.018 * spinning;
        lg[key] = set3(tp.legAt[key], r[0] * c + r[2] * sn, r[1] + step, -r[0] * sn + r[2] * c);
      }
      if (!tr.fired && t > 0.35) {
        tr.fired = true;
        this.emit('sound', { name: 'spin' });
      }
      if (!tr.dizzy && t > 2.2) {
        tr.dizzy = true;
        this.emit('sparkle', { at: this.bonePoint('head', [0, 0.08, 0]), count: 26, colors: SPARKS, up: 0.4, speed: 0.4, size: 0.02, life: 1.4 });
        this.emit('sound', { name: 'happy' });
      }
    } else if (tr.name === 'beg') {
      // sits, rises up on its haunches, waves a paw, back down
      const up = ramp(t, 0.55, 1.0) * (1 - ramp(t, 2.5, 2.9));
      const wave = ramp(t, 1.1, 1.3) * (1 - ramp(t, 2.25, 2.45));
      tp.sit = t < 3.0 ? 1 : 0;
      tp.chestRx = -0.68 * up;
      tp.chestY = 0.008 * up;
      tp.hipsRx = -0.12 * up;
      tp.hipsY = -0.008 * up;
      tp.pitch = -0.08 * up;
      tp.head[0] = 0.1 * up;
      tp.head[2] = Math.sin(t * 3) * 0.12 * wave;
      tp.neck[0] = 0.35 * up;
      tp.open = 0.6 * up;
      tp.tongue = up;
      tp.wag = 1;
      tp.squint = 0.9 * wave;
      tp.ik = 1 - up;
      // paws up in front of the chest, one waving (posed after the rest)
      tp.after = 'beg';
      tp.a = t;
      tp.b = up;
      tp.c = wave;
      if (!tr.beg && t > 0.7) {
        tr.beg = true;
        this.emit('sound', { name: 'beg' });
      }
      if (!tr.wave && t > 1.3) {
        tr.wave = true;
        this.emit('sparkle', { at: this.bonePoint('pawR', [0, 0.01, 0.01]), count: 22, colors: SPARKS, up: 0.6, speed: 0.4, size: 0.018 });
        this.emit('sound', { name: 'happy' });
      }
    }
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
    if (tp.after === 'beg') {
      const t = tp.a;
      const up = tp.b;
      const wave = tp.c;
      for (let i = 0; i < 2; i++) {
        const sd = i === 0 ? 1 : -1;
        const w = i === 1 ? wave : 0;
        const ww = Math.sin((t - 1.1) * TAU * 2.2) * w;
        // (z: + for sd = 1 swings the leg out to its side)
        pose(B[ARM[i]], lerp(B[ARM[i]].rotation.x, 0.25 - 0.55 * w, up), 0, lerp(0, sd * (-0.06 + 0.62 * w), up));
        pose(B[FORE[i]], lerp(B[FORE[i]].rotation.x, -1.1 + 0.3 * w, up), 0, ww * 0.45 * sd);
        pose(B[PAW[i]], lerp(B[PAW[i]].rotation.x, 1.1 - 0.5 * w, up), 0, ww * 0.3 * sd);
      }
    }
  }

  // a world point on the ground under the puppy (or under p)
  groundPoint(lift = 0, p = null) {
    const g = this.object.getWorldPosition(new THREE.Vector3());
    const out = p ? p.clone() : this.worldCenter();
    out.y = g.y + lift;
    return out;
  }

  trickLength(name) {
    return { bow: 2.6, spin: 3.0, beg: 3.4 }[name] || 2;
  }
}

// ------------------------------------------------------------ sounds

export const calls = {
  // a soft little 'arf': a quick rising chirp and a bell
  happy: (a, t) => {
    glide(a, t, [[0, 620], [0.05, 900], [0.13, 760]], { v: 0.1, formant: 1000, q: 1.1, breath: 0.35 });
    a.bell(1976, 0.03, t + 0.18, 0.5);
  },
  // a high puppy yip
  yip: (a, t) => {
    glide(a, t, [[0, 900], [0.04, 1500], [0.1, 1200]], { v: 0.1, formant: 1500, q: 1.2, breath: 0.4, attack: 0.008 });
  },
  // whoosh round and round, a happy arf
  spin: (a, t) => {
    for (let i = 0; i < 3; i++) puff(a, t + i * 0.5, { v: 0.05, from: 300, to: 1100, dur: 0.4 });
    glide(a, t + 0.1, [[0, 700], [0.06, 1000], [0.14, 850]], { v: 0.08, formant: 1100, breath: 0.35 });
  },
  // a soft hopeful whine (no voice: a thin rising tone)
  beg: (a, t) => {
    glide(a, t, [[0, 900], [0.25, 1250], [0.5, 1150], [0.7, 1350]], { v: 0.06, type: 'sine', formant: 1300, q: 1.6, vibrato: 14, attack: 0.05 });
  },
};
