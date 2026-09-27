// Pip, a baby penguin: a big round head with a white heart-shaped face,
// huge shiny eyes, rosy cheeks and a little glossy orange beak (the lower
// half opens to peep), a chubby body in soft down with a fluffy white
// tummy, a sleek glossy dark back, little flippers and big orange feet.
// The child's colours go on the head, sides and flippers; the tummy and
// face stay white-ish, the back dark, the beak and feet orange.
//
// Waddles: short steps on planted feet, rocking from side to side, flippers
// out for balance, the head staying level.
//
// Tricks: 'slide' (a run-up crouch, a dive onto its tummy and a belly slide
// round in a loop, feet kicking, then pops up with a shake), 'flap' (flaps
// its flippers as fast as it can and hops, trying to fly) and 'dance' (a
// happy side-to-side dance, feet tapping, flippers waving, a twirl and a
// ta-da).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, frameFrom } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { hideMaterial } from './materials.js';
import { pose, bump, ramp, smooth, Spring, TAU, clamp, lerp } from './anim.js';
import { glide, puff, flaps } from '../sound/calls.js';

const COAT = 0x2b2f3a;
const BACK = 0x20232c;
const WHITE = 0xfbfaf6;
const ORANGE = 0xffa726;
const BLUSH = 0xf5a0b4;
const SPARKS = [[1.4, 1.8, 2.2], [2.0, 1.6, 0.8], [1.9, 1.9, 2.1], [1.3, 1.9, 1.7]];

const HEAD_C = [0, 0.163, 0.004];
const HEAD_R = [0.053, 0.049, 0.049];
const EYE = [0.0195, 0.1735, 0.043];
const EYE_DIR = [0.33, 0.06, 1];
const EYE_R = 0.0132;
// the beak's root on the face, and the hinge of its lower half
const BEAK = [0, 0.158, 0.044];
const JAW = [0, 0.155, 0.044];
// a flipper: shoulder, middle, tip (left side)
const FIN = [[0.047, 0.126, 0.0], [0.059, 0.098, 0.002], [0.066, 0.068, 0.004]];
// a foot's bone (the ankle), the foot lying flat in front of it
const FOOT = [0.021, 0.007, 0.002];

const V = (a) => new THREE.Vector3(...a);

// Per-frame tables, made once (animate() allocates nothing)
const FIN_B = ['finL', 'finR'];
const FIN_TIP = ['finTipL', 'finTipR'];
const EYE_PARTS = [['eyeL', 'lidL', 'shutL', 'joyL'], ['eyeR', 'lidR', 'shutR', 'joyR']];
const SHUT = ['shutL', 'shutR'];
const JOY = ['joyL', 'joyR'];
const HOP_FLAG = ['hop0', 'hop1', 'hop2'];
const LAND_FLAG = ['land0', 'land1', 'land2'];
const BEAT_FLAG = ['b0', 'b1', 'b2', 'b3', 'b4'];
const SNOW = [[1.8, 1.9, 2.1], [1.5, 1.7, 2.1]];
// a trick's plan for a foot: on (else the foot walks as usual); local (the
// foot posed relative to the body, raised by at) or stepped out by x, y, z;
// rx: its pitch, ry: its toe-out
const footPlan = () => ({ on: false, local: false, at: new THREE.Vector3(), x: 0, y: 0, z: 0, rx: 0, ry: 0.28 });

// an ellipsoid between a and b (radii: across, along, the other way), its
// first axis turned towards `out`
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
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class Penguin extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.furry = true;
    this.hideOpts = { sheen: 0.7, clearcoat: 1.0 };
    this.voxelScale = 0.85;
    this.walkSpeed = 0.16;
    this.turnRate = 2.2;
    this.hopScale = 0.9;
    this.shared.uFurLen.value = 0.0072;
    this.shared.uStrand.value = 0.0015;
    this.shared.uComb.value.set(0, -0.35, -0.3);
    this.shared.uSplat.value = 0.15;
    this.sparkleColors = SPARKS;
    this.phase = 0;
    this.stepAmt = 0;
    this.headYaw = new Spring(0, 1.8, 0.75);
    this.headPitch = new Spring(0, 1.8, 0.75);
    this.tilt = new Spring(0, 1.3, 0.6);
    this.tiltT = 2;
    this.tiltTo = 0;
    // flippers: springs for their swing out and back
    this.fins = [0, 1].map(() => ({ out: new Spring(0.15, 2.2, 0.3), fwd: new Spring(0, 2.0, 0.35), tip: new Spring(0, 2.8, 0.3) }));
    this.flutterT = 3;
    this.tail = new Spring(0, 3, 0.25);
    this.prevYaw = null;
    this.shut = 0;
    this.joy = 0;
    // the trick plan, reused every frame
    this.tp = {
      y: 0, x: 0, z: 0, pitch: 0, roll: 0, yaw: 0, sq: 0, squint: 0, head: [0, 0, 0], open: 0, fins: null, feet: null, chest: [0, 0, 0], tail: 0,
      finPlan: [[0, 0, 0], [0, 0, 0]],
      footPlan: [footPlan(), footPlan()],
    };
    const blink = this.blinker.update.bind(this.blinker);
    this.blinker.update = (dt) => (this.shut = blink(dt));
  }

  get tricks() {
    return ['slide', 'flap', 'dance'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0.07, 0]);
    s.bone('chest', 'root', [0, 0.105, 0]);
    s.bone('head', 'chest', [0, 0.135, 0.0]);
    s.bone('jaw', 'head', JAW);
    this.eyeBones(s, EYE);
    s.bones2('shut', 'head', EYE);
    s.bones2('joy', 'head', EYE);
    s.bones2('fin', 'chest', FIN[0]);
    s.bones2('finTip', 'fin', FIN[1]);
    s.bones2('foot', 'root', FOOT);
    s.bone('tail', 'root', [0, 0.034, -0.044]);

    const coat = { paint: 0.95, fur: 0.75, rough: 0.7, pat: 0, tint: COAT };
    const white = { paint: 0.3, fur: 1.0, rough: 0.8, tint: WHITE };
    const back = { paint: 0.12, fur: 0, rough: 0.34, tint: BACK };
    s.setLook(coat);
    // a chubby body in soft down: a fluffy white tummy in front, a sleek
    // glossy dark back behind
    s.ellipsoid([0, 0.075, -0.002], [0.056, 0.064, 0.052], { bone: 'root', k: 0.03 });
    s.ellipsoid([0, 0.113, -0.002], [0.044, 0.036, 0.043], { bone: 'chest', k: 0.025 });
    s.ellipsoid([0, 0.07, 0.017], [0.043, 0.054, 0.041], { bone: 'root', k: 0.02, ...white });
    // a little pointed tail
    s.cone([0, 0.036, -0.046], [0, 0.024, -0.069], 0.012, 0.003, { bone: 'tail', k: 0.012, ...back });
    // the big round head: a dark cap, a white heart-shaped face with rosy
    // cheeks, the nape dark like the back
    const head = { bone: 'head', fur: 0.6 };
    s.ellipsoid(HEAD_C, HEAD_R, { ...head, k: 0.03 });
    s.ellipsoid([0, 0.152, 0.033], [0.034, 0.026, 0.024], { ...head, k: 0.012, ...white, fur: 0.7 });
    s.sphere([0.017, 0.172, 0.0335], 0.0175, { ...head, k: 0.012, sym: true, ...white, fur: 0.7 });
    s.ellipsoid([0.029, 0.151, 0.036], [0.009, 0.006, 0.0045], { ...head, k: 0.004, sym: true, tint: BLUSH, paint: 0.15, fur: 0.6, rough: 0.8 });
    ring(s, EYE, EYE_DIR, EYE_R * 0.5, EYE_R * 0.93, 0.0017, { ...head, k: 0.005, sym: true, ...white, fur: 0.4 });
    // flippers: flat and soft, a little apart from the body
    const fin = { sym: true, k: 0.005, fur: 0.35, rough: 0.55 };
    span(s, FIN[0], FIN[1], [0.0068, 0.019, 0.018], [1, 0, 0], { ...fin, bone: 'finL', at: 0.55 });
    span(s, FIN[1], FIN[2], [0.006, 0.02, 0.0155], [1, 0, 0], { ...fin, bone: 'finTipL', at: 0.45 });
    // feet: short legs hidden in the down, big orange webbed feet
    const foot = { sym: true, bone: 'footL', tint: ORANGE, paint: 0.12, fur: 0, rough: 0.42 };
    s.cone([FOOT[0], 0.03, -0.002], [FOOT[0], 0.009, 0.004], 0.0095, 0.008, { ...foot, k: 0.008, fur: 0.4 });
    s.ellipsoid([FOOT[0] + 0.001, 0.0052, 0.02], [0.0145, 0.0052, 0.019], { ...foot, k: 0.006 });
    for (const dx of [-0.009, 0, 0.009]) s.ellipsoid([FOOT[0] + 0.001 + dx, 0.0048, 0.036 - Math.abs(dx) * 0.45], [0.0055, 0.0046, 0.0068], { ...foot, k: 0.004 });
    // last (so nothing blends over it): the sleek glossy back, from the
    // nape down to the tail
    s.ellipsoid([0, 0.096, -0.02], [0.0545, 0.078, 0.047], { bone: 'root', k: 0.012, ...back });
    s.ellipsoid([0, 0.134, -0.017], [0.047, 0.034, 0.041], { bone: 'chest', k: 0.012, ...back });
    s.ellipsoid([0, 0.162, -0.016], [0.052, 0.045, 0.042], { bone: 'head', k: 0.01, ...back });
  }

  parts(s) {
    const I = s.index;
    this.addEyes(s, {
      c: EYE,
      r: EYE_R,
      dir: EYE_DIR,
      iris: 0x4a3226,
      iris2: 0x14100e,
      irisSize: 0.98,
      pupil: 0.62,
      lid: { tint: 0xf4f1ec, paint: 0.3, fur: 0.5, rough: 0.8, open: -0.55, closed: 1.45 },
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
    // the beak: a glossy little cone, flattened, its lower half on the jaw
    const upper = tubeGeometry([[0, BEAK[1] + 0.0035, BEAK[2] - 0.004], [0, BEAK[1] + 0.003, BEAK[2] + 0.008], [0, BEAK[1] + 0.0012, BEAK[2] + 0.018], [0, BEAK[1] - 0.0015, BEAK[2] + 0.0265]], [0.0115, 0.0098, 0.0062, 0.0014], { radial: 18, steps: 20 });
    upper.translate(0, -BEAK[1], 0).scale(1, 0.6, 1).translate(0, BEAK[1], 0);
    const lower = tubeGeometry([[0, JAW[1] - 0.0005, JAW[2] - 0.004], [0, JAW[1] - 0.001, JAW[2] + 0.008], [0, JAW[1] - 0.0015, JAW[2] + 0.017]], [0.0092, 0.0072, 0.0014], { radial: 16, steps: 16 });
    lower.translate(0, -JAW[1], 0).scale(1, 0.52, 1).translate(0, JAW[1], 0);
    upper.computeVertexNormals();
    lower.computeVertexNormals();
    const bl = { tint: ORANGE, paint: 0.1, rough: 0.32 };
    this.addMesh(mergeGeometries([bindTo(withLook(upper, bl), I.head), bindTo(withLook(lower, { ...bl, tint: 0xf59a1e }), I.jaw)]), this.mat('solid', { clearcoat: 0.8 }), { shadow: false });
    // The colouring outline gets a line round the tummy: an invisible patch
    // just in front of it with a region of its own (it draws nothing, in the
    // world or as paint; only the outline's mask pass sees it).
    const patch = new THREE.CircleGeometry(1, 48);
    patch.deleteAttribute('uv');
    patch.scale(0.038, 0.05, 1).translate(0, 0.066, 0.061);
    const pm = this.mat('solid');
    pm.colorWrite = false;
    pm.depthWrite = false;
    this.addMesh(bindTo(withLook(patch, { tint: WHITE }), I.root), pm, { shadow: false, receive: false }).userData.region = 2;
  }

  async build() {
    await super.build();
    this.bones.root.rotation.order = 'YXZ';
    this.feet = ['L', 'R'].map((S) => {
      const b = this.bones['foot' + S];
      // rest: the bone's own rest offset (from root); home: where the foot
      // stands, in the object's space
      return { b, rest: b.position.clone(), home: new THREE.Vector3(S === 'L' ? FOOT[0] : -FOOT[0], FOOT[1], FOOT[2]), target: new THREE.Vector3(), pitch: 0 };
    });
    return this;
  }

  // place a foot bone (a child of root) at a target given in the object's
  // own space, keeping it flat on the ground (plus its own pitch and toe-out)
  placeFoot(F, pitch, toeOut) {
    const root = this.bones.root;
    root.updateWorldMatrix(true, false);
    _w.copy(F.target);
    this.object.localToWorld(_w);
    root.worldToLocal(_w);
    F.b.position.copy(_w);
    // undo the root's turn so the foot stays flat
    _q.copy(root.quaternion).invert();
    _e.set(pitch, toeOut, 0, 'YXZ');
    F.b.quaternion.setFromEuler(_e).premultiply(_q);
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

    const tp = this.tp;
    tp.y = tp.x = tp.z = tp.pitch = tp.roll = tp.yaw = tp.sq = tp.squint = tp.open = tp.tail = 0;
    tp.head[0] = tp.head[1] = tp.head[2] = 0;
    tp.chest[0] = tp.chest[1] = tp.chest[2] = 0;
    tp.fins = tp.feet = null;
    if (doing) this.trickPlan(tr, dt, tp);

    // ---- the waddle: short steps on planted feet, rocking side to side
    const pace = clamp(m.speed / this.walkSpeed, 0, 1.4);
    const moveAmt = Math.max(pace, clamp(Math.abs(yawRate) / 1.2, 0, 0.6)) * (air > 0 ? 0 : 1) * (doing ? 0 : 1);
    this.stepAmt += ((moveAmt > 0.03 ? 1 : 0) - this.stepAmt) * (1 - Math.exp(-dt * 6));
    const hz = lerp(1.5, 2.2, clamp(pace, 0, 1));
    this.phase += dt * hz * (this.stepAmt > 0.01 ? 1 : 0);
    const D = 0.6;
    const S = (m.speed * D) / hz;
    const ph = this.phase % 1;
    const sway = Math.sin(TAU * (ph - 0.55)) * this.stepAmt;
    for (let i = 0; i < 2; i++) {
      const F = this.feet[i];
      const p = (this.phase + (i === 0 ? 0.2 : 0.7)) % 1;
      let dz;
      let y = 0;
      let q = 0;
      if (p < D) dz = S / 2 - S * (p / D);
      else {
        q = (p - D) / (1 - D);
        dz = -S / 2 + S * smooth(q);
        y = 0.011 * Math.sin(Math.PI * q) * clamp(pace * 1.5, 0.5, 1);
      }
      F.target.set(F.home.x, F.home.y + y * this.stepAmt, F.home.z + dz * this.stepAmt);
      F.pitch = -Math.sin(Math.PI * q) * 0.35 * this.stepAmt;
    }

    // ---- body
    const breathe = Math.sin(t * TAU * 0.5);
    root.position.x += -0.006 * sway + tp.x;
    root.position.y += Math.abs(Math.cos(TAU * (ph - 0.55))) * 0.004 * this.stepAmt - 0.003 * this.stepAmt + tp.y;
    root.position.z += tp.z;
    root.rotation.set(0.04 * pace + tp.pitch, 0.07 * Math.sin(TAU * (ph - 0.3)) * this.stepAmt + tp.yaw, 0.16 * sway + tp.roll);
    const sq = tp.sq;
    root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    B.chest.scale.set(1 + breathe * 0.01, 1 + breathe * 0.012, 1 + breathe * 0.01);
    pose(B.chest, tp.chest[0], tp.chest[1], tp.chest[2] - 0.05 * sway);

    // ---- feet: planted on the ground, toes out
    const feetOn = air > 0 ? 1 - air : 1;
    for (let i = 0; i < 2; i++) {
      const F = this.feet[i];
      const side = i === 0 ? 1 : -1;
      const f = tp.feet ? tp.feet[i] : null;
      if (f && f.on) {
        if (f.local) {
          // a trick poses the foot itself, relative to the body
          F.b.position.copy(F.rest).add(f.at);
          pose(F.b, f.rx, f.ry * side, 0);
          continue;
        }
        F.target.set(F.home.x + f.x * side, F.home.y + f.y, F.home.z + f.z);
        F.pitch = f.rx;
      }
      if (feetOn >= 1) this.placeFoot(F, F.pitch, 0.28 * side);
      else {
        F.b.position.copy(F.rest);
        pose(F.b, 0.9 * air, 0.28 * side, 0);
      }
    }

    // ---- head: looks about, curious tilts, stays level as the body rocks
    let yaw = Math.sin(t * 0.33 + 1) * 0.45 + Math.sin(t * 0.13) * 0.25;
    let hpitch = Math.sin(t * 0.27) * 0.08;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z - 0.05), -1.0, 1.0);
      hpitch = clamp(-Math.atan2(this.lookLocal.y - 0.17, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.5, 0.35);
    }
    this.tiltT -= dt;
    if (this.tiltT <= 0) {
      this.tiltTo = this.tiltTo !== 0 || Math.random() < 0.45 ? 0 : (Math.random() < 0.5 ? 1 : -1) * (0.25 + Math.random() * 0.12);
      this.tiltT = this.tiltTo !== 0 ? 1 + Math.random() : 1.5 + Math.random() * 3;
    }
    const tilt = this.tilt.update(this.tiltTo * (1 - this.stepAmt), dt);
    const hy = this.headYaw.update(yaw * (1 - this.stepAmt * 0.6), dt);
    const hp = this.headPitch.update(hpitch - root.rotation.x * 0.7, dt);
    pose(B.head, hp + tp.head[0], hy + tp.head[1], tilt - 0.12 * sway + tp.head[2]);
    pose(B.jaw, 0.4 * clamp(tp.open, 0, 1), 0, 0);

    // ---- flippers: out for balance when waddling, a happy flutter now and
    // then, springy
    this.flutterT -= dt;
    let flutter = 0;
    if (this.flutterT < 0) {
      flutter = Math.max(0, Math.sin(-this.flutterT * TAU * 5)) * bump(-this.flutterT, 0, 0.8);
      if (this.flutterT < -0.8) this.flutterT = 3 + Math.random() * 5;
    }
    for (let i = 0; i < 2; i++) {
      const fn = this.fins[i];
      const side = i === 0 ? 1 : -1;
      let out = 0.22 + 0.25 * this.stepAmt + 0.12 * sway * side + flutter * 0.5 + 1.1 * air;
      let fwd = 0.1 * this.stepAmt - 0.25 * air;
      let tipT = 0;
      if (tp.fins) {
        const f = tp.fins[i];
        out = f[0];
        fwd = f[1];
        tipT = f[2];
      }
      const o = fn.out.update(out, dt);
      const f2 = fn.fwd.update(fwd, dt);
      const tip = fn.tip.update(tipT + o * 0.2, dt);
      pose(B[FIN_B[i]], f2, 0, o * side);
      pose(B[FIN_TIP[i]], 0, 0, tip * side);
    }

    // ---- the little tail wiggles with each step
    const tw = this.tail.update(Math.sin(TAU * ph) * 0.3 * this.stepAmt + tp.tail, dt);
    pose(B.tail, 0.1 * air, tw, 0);

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
    if (tr.name === 'slide') {
      // a run-up crouch, a dive onto its tummy, a belly slide round in a
      // loop (back where it started), then pops up with a shake
      const crouch = bump(t, 0.0, 0.55);
      const lie = ramp(t, 0.42, 0.72) * (1 - ramp(t, 2.75, 3.05));
      const u = clamp((t - 0.6) / 2.2, 0, 1);
      // along the loop: quick after the dive, slowing down to a stop
      const a = TAU * (1 - Math.pow(1 - u, 2.2));
      const R = 0.085;
      tp.x = R * (1 - Math.cos(a));
      tp.z = R * Math.sin(a);
      tp.yaw = a;
      tp.pitch = 1.42 * lie - 0.12 * crouch;
      tp.y = -0.018 * lie - 0.012 * crouch + 0.03 * bump(t, 2.8, 3.2);
      tp.sq = 0.1 * crouch - 0.06 * bump(t, 2.8, 3.2);
      tp.roll = 0.18 * Math.sin(a) * lie + Math.sin(t * 22) * 0.1 * bump(t, 3.05, 3.5);
      // head up, looking where it goes; beak open for a 'wheee'
      tp.head[0] = -1.05 * lie + 0.15 * crouch;
      tp.head[1] = 0.35 * lie;
      tp.open = 0.8 * bump(t, 0.5, 1.6) + 0.5 * bump(t, 3.0, 3.4);
      tp.squint = 0.9 * ramp(t, 0.55, 0.65) * (1 - ramp(t, 2.6, 2.75)) + 0.9 * bump(t, 3.1, 3.55);
      // flippers swept back like wings, a flap as it pops up
      const fl = bump(t, 2.85, 3.55);
      this.planFins(tp, 0.25 + 0.35 * lie + Math.max(0, Math.sin(t * 26)) * 1.0 * fl, 0.55 * lie + 0.3 * crouch, 0.2 * lie);
      // feet kick behind while sliding
      if (lie > 0.05) {
        const ft = this.planFeet(tp);
        for (let i = 0; i < 2; i++) {
          ft[i].on = ft[i].local = true;
          ft[i].at.set(0, 0.004 * lie, 0);
          ft[i].rx = -0.9 * lie + Math.sin(t * 14 + i * Math.PI) * 0.35 * lie;
        }
      }
      tp.tail = Math.sin(t * 16) * 0.5 * lie;
      // snow sparkles off the tummy
      tr.nextFx ??= 0.75;
      if (t > tr.nextFx && t < 2.7) {
        tr.nextFx = t + 0.2;
        this.emit('sparkle', { at: this.groundPoint(0.01, this.bonePoint('root', [0, -0.05, 0.02])), count: 10, colors: SNOW, up: 0.35, speed: 0.4, size: 0.014, life: 0.9 });
      }
      if (!tr.fired && t > 0.45) {
        tr.fired = true;
        this.emit('sound', { name: 'slide' });
      }
      if (!tr.up && t > 2.95) {
        tr.up = true;
        this.emit('sparkle', { at: this.bonePoint('head', [0, 0.04, 0.02]), count: 24, colors: SPARKS, up: 0.8, speed: 0.6, size: 0.02 });
        this.emit('sound', { name: 'happy' });
        this.happy.kick(3);
      }
    } else if (tr.name === 'flap') {
      // flaps as fast as it can and hops, trying to fly
      const crouch = bump(t, 0.0, 0.4);
      const T0 = 0.38, P = 0.5, N = 3;
      let h = 0, land = 0;
      for (let n = 0; n < N; n++) {
        const k = (t - T0 - n * P) / (P * 0.8);
        if (k > 0 && k < 1) h = Math.sin(k * Math.PI) * (0.03 + 0.012 * n);
        land = Math.max(land, bump(t, T0 + n * P + P * 0.78, T0 + n * P + P * 1.05));
      }
      const flapping = ramp(t, 0.3, 0.4) * (1 - ramp(t, 1.9, 2.1));
      const beat = Math.sin(t * TAU * 7);
      tp.y = h * this.hopScale;
      tp.sq = 0.1 * crouch + 0.1 * land - (h > 0 ? 0.05 : 0);
      tp.pitch = -0.06 * crouch - 0.08 * (h > 0 ? 1 : 0);
      tp.head[0] = -0.25 * flapping;
      tp.head[2] = 0.1 * Math.sin(t * 5) * flapping;
      tp.open = 0.6 * flapping * Math.max(0, Math.sin(t * TAU * 2));
      tp.squint = 0.9 * ramp(t, 2.1, 2.2) * (1 - ramp(t, 2.6, 2.75));
      this.planFins(tp, 0.35 + 0.2 * crouch + flapping * (0.85 + 0.65 * beat), -0.1 * flapping, flapping * 0.4 * beat);
      // feet dangle in the air
      // (off the ground the feet go up with it, toes dangling)
      if (h > 0.002) {
        const ft = this.planFeet(tp);
        for (let i = 0; i < 2; i++) {
          ft[i].on = ft[i].local = true;
          ft[i].at.set(0, 0.002, 0);
          ft[i].rx = 0.45 + Math.sin(t * 20 + i * 2) * 0.12;
        }
      }
      for (let n = 0; n < N; n++) {
        if (!tr[HOP_FLAG[n]] && t > T0 + n * P + P * 0.35) {
          tr[HOP_FLAG[n]] = true;
          for (const S of ['L', 'R']) this.emit('sparkle', { at: this.bonePoint('finTip' + S, [0, -0.02, 0]), count: 10, colors: SPARKS, up: 0.5, speed: 0.5, size: 0.016 });
          if (n === 0) this.emit('sound', { name: 'flap' });
        }
        if (!tr[LAND_FLAG[n]] && t > T0 + n * P + P * 0.8) {
          tr[LAND_FLAG[n]] = true;
          this.emit('land', { at: this.groundPoint(0.005) });
        }
      }
      if (!tr.happy && t > 2.15) {
        tr.happy = true;
        this.emit('sound', { name: 'happy' });
        this.happy.kick(2);
      }
    } else if (tr.name === 'dance') {
      // a happy side-to-side dance on the beat, then a twirl and a ta-da
      const on = ramp(t, 0.0, 0.25) * (1 - ramp(t, 2.3, 2.5));
      const beat = t * 2.2;
      const s = Math.sin(beat * Math.PI);
      const twirl = smooth((t - 2.35) / 0.75);
      const tada = ramp(t, 3.0, 3.15) * (1 - ramp(t, 3.55, 3.8));
      tp.roll = 0.22 * s * on;
      tp.x = -0.01 * s * on;
      tp.y = 0.006 * Math.abs(Math.cos(beat * Math.PI)) * on + 0.02 * bump(t, 2.3, 2.9) - 0.006 * bump(t, 2.9, 3.1);
      tp.yaw = twirl * TAU;
      tp.head[0] = 0.12 * Math.abs(s) * on - 0.2 * tada;
      tp.head[1] = 0.2 * Math.sin(beat * Math.PI * 0.5) * on;
      tp.head[2] = -0.25 * s * on;
      tp.open = Math.max(0, Math.sin(beat * Math.PI * 2)) * 0.7 * on + 0.8 * tada;
      tp.squint = 0.9 * Math.max(ramp(t, 0.3, 0.4) * (1 - ramp(t, 2.2, 2.3)), tada);
      tp.fins = tp.finPlan;
      const ft = this.planFeet(tp);
      for (let i = 0; i < 2; i++) {
        const w = Math.sin(beat * Math.PI + (i === 0 ? 0 : Math.PI));
        const f = tp.fins[i];
        f[0] = 0.3 + 0.55 * (0.5 + 0.5 * w) * on + 1.0 * bump(t, 2.3, 3.0) + 1.25 * tada;
        f[1] = -0.2 * on;
        f[2] = 0.4 * w * on;
        // feet tap in turn: the one it leans away from lifts
        const up = Math.max(0, (i === 0 ? 1 : -1) * s) * on;
        ft[i].on = true;
        ft[i].y = 0.01 * up;
        ft[i].rx = -0.4 * up;
      }
      tp.tail = 0.5 * s * on;
      for (let n = 0; n < 5; n++) {
        const T = n / 2.2;
        if (!tr[BEAT_FLAG[n]] && t > T && t < 2.3) {
          tr[BEAT_FLAG[n]] = true;
          if (n % 2 === 0) this.emit('sparkle', { at: this.bonePoint('head', [0, 0.06, 0]), count: 8, colors: SPARKS, up: 0.4, speed: 0.4, size: 0.014 });
        }
      }
      if (!tr.fired) {
        tr.fired = true;
        this.emit('sound', { name: 'dance' });
      }
      if (!tr.tada && t > 3.05) {
        tr.tada = true;
        this.emit('sparkle', { at: this.bonePoint('head', [0, 0.05, 0.02]), count: 34, colors: SPARKS, up: 1.0, speed: 0.7, size: 0.022, life: 1.4 });
        this.emit('sound', { name: 'happy' });
        this.happy.kick(3);
      }
    }
  }

  // both flippers the same way (out, forwards, tip) for a trick
  planFins(tp, out, fwd, tip) {
    for (const f of tp.finPlan) {
      f[0] = out;
      f[1] = fwd;
      f[2] = tip;
    }
    tp.fins = tp.finPlan;
  }

  // the feet's plans for a trick, cleared (each foot off until set)
  planFeet(tp) {
    for (const f of tp.footPlan) {
      f.on = f.local = false;
      f.at.set(0, 0, 0);
      f.x = f.y = f.z = f.rx = 0;
      f.ry = 0.28;
    }
    tp.feet = tp.footPlan;
    return tp.footPlan;
  }

  // a world point on the ground under the penguin (or under p)
  groundPoint(lift = 0, p = null) {
    const g = this.object.getWorldPosition(new THREE.Vector3());
    const out = p ? p.clone() : this.worldCenter();
    out.y = g.y + lift;
    return out;
  }

  trickLength(name) {
    return { slide: 3.7, flap: 2.9, dance: 3.9 }[name] || 2;
  }
}

// ------------------------------------------------------------ sounds

// a baby penguin's peep
function peep(a, t, f = 1600, v = 0.09) {
  glide(a, t, [[0, f], [0.05, f * 1.35], [0.11, f * 1.15]], { v, formant: f * 1.3, q: 1.3, breath: 0.25, attack: 0.01 });
}

export const calls = {
  happy: (a, t) => {
    peep(a, t, 1550, 0.09);
    peep(a, t + 0.15, 1750, 0.08);
    a.bell(2349, 0.025, t + 0.3, 0.5);
  },
  // 'wheee' down the slide, with the swish of the tummy on the ground
  slide: (a, t) => {
    glide(a, t, [[0, 1100], [0.35, 1900], [0.9, 1650]], { v: 0.07, type: 'sine', formant: 1800, q: 1.1, vibrato: 18, attack: 0.04 });
    puff(a, t + 0.15, { v: 0.05, from: 500, to: 1400, dur: 2.2 });
  },
  // flipper flaps and hopeful peeps
  flap: (a, t) => {
    flaps(a, t, 10, 0.14, 0.07);
    peep(a, t + 0.1, 1700, 0.07);
    peep(a, t + 0.6, 1850, 0.07);
    peep(a, t + 1.1, 2000, 0.07);
  },
  // a little tune to dance to, peeps on the beat
  dance: (a, t) => {
    const notes = [1318.5, 1568, 1760, 1568, 1318.5, 1568, 2093];
    notes.forEach((f, i) => a.bell(f, 0.035, t + i * 0.3, 0.7));
    for (let i = 0; i < 4; i++) peep(a, t + 0.15 + i * 0.6, 1500 + i * 120, 0.06);
  },
};
