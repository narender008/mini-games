// Shelly, a little turtle: a high glossy domed shell made of real plates
// (a row of big ones down the middle, four a side, a ring of small ones
// round the rim), each with fine growth rings and a groove between, over a
// cream belly plate; soft scaly skin; a big round head with huge shiny
// eyes, rosy cheeks and a wide smile; stubby legs with round feet and
// little pale claws, and a short pointed tail. The child's colours go on
// the shell (the grooves stay a little darker) and the skin.
//
// Walks slowly on planted feet (two-bone IK, diagonal pairs), the shell
// swaying and the head bobbing with each step.
//
// Tricks: 'hide' (pulls everything into its shell, which drops with a
// bump, trembles, then the eyes peek out, look about, and out it pops
// with a smile), 'spin' (hops, flips onto its back and spins round on its
// shell, legs waving, then flips back over) and 'stretch' (rises on its
// legs, stretches its neck up long with a big yawn, stretches each leg,
// then a big smile).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, frameFrom } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { hideMaterial } from './materials.js';
import { pose, bump, ramp, smooth, Spring, TAU, clamp, lerp, twoBone } from './anim.js';
import { glide, puff } from '../sound/calls.js';

const SKIN = 0x8bc34a;
const SHELL = 0x4caf50;
const GROOVE = 0x3b2a18;
const BELLY = 0xefe1a6;
const CLAW = 0xf3ead2;
const BLUSH = 0xf5a0a8;
const MOUTH = 0x2f2418;
const MOUTH_IN = 0x5a1e26;
const TONGUE = 0xf07d8e;
const SPARKS = [[1.3, 2.0, 1.1], [2.0, 1.8, 0.8], [1.2, 1.7, 2.1], [1.9, 1.3, 1.6]];

const HEAD_C = [0, 0.086, 0.16];
const HEAD_R = [0.036, 0.033, 0.038];
const EYE = [0.0215, 0.0955, 0.181];
const EYE_DIR = [0.5, 0.1, 1];
const EYE_R = 0.0125;
// the middle of the smile (the open mouth grows down from it)
const MOUTH_AT = [0, 0.0752, 0.1965];
// the shell: a dome over the body (half width, half length, rim height,
// dome height, centre z)
const SH = { a: 0.079, b: 0.104, y0: 0.047, H: 0.074, zc: -0.004 };
// legs: [upper, lower, foot] bone rest positions (left side)
const FRONT = [[0.05, 0.05, 0.066], [0.062, 0.03, 0.078], [0.064, 0.011, 0.084]];
const HIND = [[0.048, 0.05, -0.064], [0.06, 0.03, -0.076], [0.062, 0.011, -0.082]];

const V = (a) => new THREE.Vector3(...a);

// Per-frame tables, made once (animate() allocates nothing)
const GAIT = { FL: 0, HR: 0.04, FR: 0.5, HL: 0.54 };
const LEG_KEYS = ['FL', 'FR', 'HL', 'HR'];
const ARM = ['armL', 'armR'];
const FORE = ['foreL', 'foreR'];
const PAW = ['pawL', 'pawR'];
const THIGH = ['thighL', 'thighR'];
const SHIN = ['shinL', 'shinR'];
const FOOT = ['footL', 'footR'];
const EYE_PARTS = [['eyeL', 'lidL', 'shutL', 'joyL'], ['eyeR', 'lidR', 'shutR', 'joyR']];
const SHUT = ['shutL', 'shutR'];
const JOY = ['joyL', 'joyR'];

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
    const ik = twoBone(this.l1, this.l2, Math.hypot(dy, dz), this._ik);
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

// The shell: a dome (a polar grid seen from above) with the plates pressed
// into it: a groove along every border, fine growth rings inside each
// plate, each plate gently puffed up; then a rim that flares a little and
// tucks under. Returns the geometry with a per-vertex look (the grooves
// darker and less painted).
function shellGeometry() {
  const NR = 60;
  const NS = 144;
  const pos = [];
  const tint = [];
  const mix = [];
  const idx = [];
  const base = new THREE.Color(SHELL);
  const groove = new THREE.Color(GROOVE);
  const rimCol = new THREE.Color(0x6a5a30);
  // the rim is a little higher at the front (for the head) and the back
  const y0 = (th) => SH.y0 + 0.011 * Math.pow(Math.max(0, Math.sin(th)), 4) + 0.005 * Math.pow(Math.max(0, -Math.sin(th)), 6);
  // the plates, in the dome's own top-down coordinates (u across, w along)
  const seeds = [[0, 0.62], [0, 0.31], [0, 0], [0, -0.31], [0, -0.62]];
  for (const s of [1, -1]) for (const w of [0.47, 0.16, -0.16, -0.47]) seeds.push([0.6 * s, w]);
  const L = (SH.a + SH.b) / 2;
  const RING = 0.8;
  const MARG = 26;
  // distance (m) to the nearest plate border, and a plate id
  const plate = (u, w) => {
    const rn = Math.hypot(u, w);
    if (rn > RING) {
      const th = Math.atan2(w, u);
      const k = ((th / TAU) * MARG + MARG + 0.5) % 1;
      const dAng = Math.min(k, 1 - k) * (TAU / MARG) * rn * L;
      return { d: Math.min((rn - RING) * L, dAng, (1 - rn) * L + 0.004), id: 100 + Math.floor(((th / TAU) * MARG + MARG + 0.5) % MARG) };
    }
    let i1 = 0, d1 = Infinity, i2 = 0, d2 = Infinity;
    seeds.forEach(([su, sw], i) => {
      const d = (u - su) ** 2 + (w - sw) ** 2;
      if (d < d1) {
        i2 = i1;
        d2 = d1;
        i1 = i;
        d1 = d;
      } else if (d < d2) {
        i2 = i;
        d2 = d;
      }
    });
    const [au, aw] = seeds[i1];
    const [bu, bw] = seeds[i2];
    const ab = Math.hypot(bu - au, bw - aw);
    const dv = (d2 - d1) / (2 * ab);
    return { d: Math.min(dv * L, (RING - rn) * L), id: i1 };
  };
  const put = (x, y, z, c, paint, rough) => {
    pos.push(x, y, z);
    tint.push(c.r, c.g, c.b);
    mix.push(paint, 0, rough, 0);
  };
  const dome = (u, w, th) => {
    const r2 = Math.min(1, u * u + w * w);
    // (the rim's rise at the front and back fades out towards the top)
    const y = SH.y0 + (y0(th) - SH.y0) * r2 * r2 + SH.H * Math.pow(1 - r2, 0.55);
    return [u * SH.a, y, SH.zc + w * SH.b];
  };
  const c = new THREE.Color();
  // centre, then rings
  for (let i = 0; i <= NR; i++) {
    const rn = i / NR;
    const ns = i === 0 ? 1 : NS;
    for (let j = 0; j < ns; j++) {
      const th = (j / NS) * TAU;
      const u = rn * Math.cos(th), w = rn * Math.sin(th);
      const [x, y, z] = dome(u, w, th);
      // outward normal of the dome (roughly), to press the plates in
      const n = new THREE.Vector3(x / (SH.a * SH.a), (y - y0(th)) / (SH.H * SH.H) + 0.2, (z - SH.zc) / (SH.b * SH.b)).normalize();
      const p = plate(u, w);
      const g = 1 - smooth(p.d / 0.0028);
      const rings = p.d > 0.002 ? 0.5 + 0.5 * Math.cos((p.d / 0.0031) * TAU) : 0;
      const puffUp = smooth(p.d / 0.014);
      const off = -0.0016 * g - 0.00018 * rings * (1 - g) + 0.0016 * puffUp;
      // plates vary a touch in tone
      const tone = 0.93 + 0.14 * ((Math.sin(p.id * 12.9898) * 43758.5453) % 1 + 1) % 1;
      c.copy(base).multiplyScalar(tone).lerp(groove, g * 0.9);
      put(x + n.x * off, y + n.y * off, z + n.z * off, c, 0.95 - 0.6 * g - 0.06 * rings, 0.3 + 0.25 * g);
    }
  }
  const ringStart = (i) => (i === 0 ? 0 : 1 + (i - 1) * NS);
  for (let j = 0; j < NS; j++) idx.push(0, 1 + ((j + 1) % NS), 1 + j);
  for (let i = 1; i < NR; i++) {
    const a0 = ringStart(i), b0 = ringStart(i + 1);
    for (let j = 0; j < NS; j++) {
      const j1 = (j + 1) % NS;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  // the rim: out a little, down, and tucked under
  const rim = [[1.0, 0, 0], [1.03, -0.004, 0], [1.045, -0.011, 0], [1.03, -0.016, 0], [0.93, -0.018, 1]];
  let prev = ringStart(NR);
  for (const [rs, dy, under] of rim) {
    const s0 = pos.length / 3;
    for (let j = 0; j < NS; j++) {
      const th = (j / NS) * TAU;
      const [x, , z] = dome(Math.cos(th), Math.sin(th), th);
      c.copy(rimCol).lerp(new THREE.Color(BELLY), under * 0.6);
      put(x * rs, y0(th) + dy, SH.zc + (z - SH.zc) * rs, c, 0.8 - 0.5 * under, 0.4);
    }
    for (let j = 0; j < NS; j++) {
      const j1 = (j + 1) % NS;
      idx.push(prev + j, prev + j1, s0 + j, prev + j1, s0 + j1, s0 + j);
    }
    prev = s0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 3));
  geo.setAttribute('aMix', new THREE.Float32BufferAttribute(mix, 4));
  return geo;
}

export class Turtle extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.furry = false;
    this.hideOpts = { scales: true, clearcoat: 0.25, sheen: 0.2 };
    this.voxelScale = 0.85;
    this.walkSpeed = 0.07;
    this.turnRate = 1.4;
    this.hopScale = 0.7;
    this.shared.uScale.value = 0.0028;
    this.shared.uSplat.value = 0.2;
    this.sparkleColors = SPARKS;
    this.phase = 0;
    this.stepAmt = 0;
    this.headYaw = new Spring(0, 1.2, 0.8);
    this.headPitch = new Spring(0, 1.2, 0.8);
    this.tilt = new Spring(0, 1.0, 0.7);
    this.tiltT = 3;
    this.tiltTo = 0;
    this.tail = new Spring(0, 2.2, 0.3);
    this.prevYaw = null;
    this.shut = 0;
    this.joy = 0;
    // the trick plan, reused every frame
    this.tp = {
      y: 0, pitch: 0, roll: 0, yaw: 0, sq: 0, squint: 0, head: [0, 0, 0], neck: [0, 0, 0], reach: 0, tuck: 0, open: 0, legs: null, ik: 1, tail: 0, after: null, a: 0, b: 0,
      legPlan: { FL: null, FR: null, HL: null, HR: null },
      legAt: { FL: [0, 0, 0], FR: [0, 0, 0], HL: [0, 0, 0], HR: [0, 0, 0] },
    };
    const blink = this.blinker.update.bind(this.blinker);
    this.blinker.update = (dt) => (this.shut = blink(dt));
  }

  get tricks() {
    return ['hide', 'spin', 'stretch'];
  }

  async build() {
    await super.build();
    this.bones.root.rotation.order = 'YXZ';
    this.legs = {
      FL: new Leg(this, ['armL', 'foreL', 'pawL'], -1),
      FR: new Leg(this, ['armR', 'foreR', 'pawR'], -1),
      HL: new Leg(this, ['thighL', 'shinL', 'footL'], 1),
      HR: new Leg(this, ['thighR', 'shinR', 'footR'], 1),
    };
    return this;
  }

  sculpt(s) {
    s.bone('root', null, [0, 0.06, 0]);
    s.bone('shell', 'root', [0, 0.08, 0]);
    s.bone('neck0', 'root', [0, 0.054, 0.072]);
    s.bone('neck1', 'neck0', [0, 0.066, 0.108]);
    s.bone('head', 'neck1', [0, 0.078, 0.138]);
    s.bone('mouth', 'head', MOUTH_AT);
    this.eyeBones(s, EYE);
    s.bones2('shut', 'head', EYE);
    s.bones2('joy', 'head', EYE);
    s.bones2('arm', 'root', FRONT[0]);
    s.bones2('fore', 'arm', FRONT[1]);
    s.bones2('paw', 'fore', FRONT[2]);
    s.bones2('thigh', 'root', HIND[0]);
    s.bones2('shin', 'thigh', HIND[1]);
    s.bones2('foot', 'shin', HIND[2]);
    s.bone('tail', 'root', [0, 0.046, -0.094]);
    s.bone('tailTip', 'tail', [0, 0.04, -0.112]);

    const skin = { paint: 0.85, fur: 0, rough: 0.55, pat: 0.8, tint: SKIN };
    s.setLook(skin);
    // the body under the shell, with a cream belly plate
    s.ellipsoid([0, 0.05, -0.002], [0.066, 0.03, 0.093], { bone: 'root', k: 0.02, tint: BELLY, paint: 0.3, pat: 0, rough: 0.5 });
    // neck and a big round head
    s.cone([0, 0.05, 0.06], [0, 0.07, 0.125], 0.022, 0.02, { bone: 'neck0', k: 0.02 });
    s.cone([0, 0.066, 0.108], [0, 0.076, 0.136], 0.02, 0.021, { bone: 'neck1', k: 0.02 });
    const head = { bone: 'head', pat: 0.25 };
    s.ellipsoid(HEAD_C, HEAD_R, { ...head, k: 0.025 });
    s.ellipsoid([0, 0.077, 0.172], [0.028, 0.017, 0.024], { ...head, k: 0.015 });
    s.ellipsoid([0.026, 0.0795, 0.184], [0.0085, 0.006, 0.0045], { ...head, k: 0.004, sym: true, tint: BLUSH, paint: 0.2, pat: 0, rough: 0.7 });
    s.sphere([0.0048, 0.0925, 0.1985], 0.0019, { ...head, k: 0.002, sub: true, sym: true, tint: 0x24301a, paint: 0.2, pat: 0 });
    ring(s, EYE, EYE_DIR, EYE_R * 0.52, EYE_R * 0.95, 0.0017, { ...head, k: 0.005, sym: true, pat: 0.2 });
    // stubby legs with round feet and little pale claws
    const leg = { sym: true };
    s.cone(FRONT[0], FRONT[1], 0.017, 0.015, { ...leg, bone: 'armL', k: 0.015 });
    s.cone(FRONT[1], FRONT[2], 0.015, 0.0145, { ...leg, bone: 'foreL', k: 0.01 });
    s.cone(HIND[0], HIND[1], 0.018, 0.016, { ...leg, bone: 'thighL', k: 0.015 });
    s.cone(HIND[1], HIND[2], 0.016, 0.0145, { ...leg, bone: 'shinL', k: 0.01 });
    for (const [p, bone] of [[FRONT[2], 'pawL'], [HIND[2], 'footL']]) {
      s.ellipsoid([p[0] + 0.002, 0.0095, p[2] + 0.005], [0.0175, 0.0095, 0.019], { ...leg, bone, k: 0.01 });
      for (const dx of [-0.009, 0, 0.009]) s.ellipsoid([p[0] + 0.002 + dx, 0.0055, p[2] + 0.022 - Math.abs(dx) * 0.4], [0.0036, 0.0034, 0.004], { ...leg, bone, k: 0.003, tint: CLAW, paint: 0.1, pat: 0, rough: 0.35 });
    }
    // a short pointed tail
    s.cone([0, 0.048, -0.086], [0, 0.04, -0.112], 0.013, 0.008, { bone: 'tail', k: 0.012 });
    s.cone([0, 0.04, -0.112], [0, 0.033, -0.128], 0.008, 0.002, { bone: 'tailTip', k: 0.008 });
  }

  parts(s) {
    const I = s.index;
    const geo = this.body.geometry;
    this.addEyes(s, {
      c: EYE,
      r: EYE_R,
      dir: EYE_DIR,
      iris: 0x6a4424,
      iris2: 0x1e120a,
      irisSize: 0.98,
      pupil: 0.58,
      lid: { tint: SKIN, paint: 0.85, pat: 0.3, rough: 0.6, open: -0.55, closed: 1.45 },
    });
    // soft lids: no gloss
    const lidMat = hideMaterial(this.shared, { sheen: 0.2, clearcoat: 0 });
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
    // a wide smile, turned up at the corners
    const on = (p) => onSurface(geo, p, 0.0008);
    const sm = [];
    for (let i = 0; i <= 12; i++) {
      const u = -1 + i / 6;
      sm.push(on([u * 0.018, MOUTH_AT[1] + 0.0045 * u * u - 0.0006, MOUTH_AT[2] - 0.012 * u * u]));
    }
    const smile = tubeGeometry(sm, [0.0005, 0.0009, 0.001, 0.001, 0.0009, 0.0005], { radial: 6, steps: 32 });
    this.addMesh(bindTo(withLook(smile, { tint: MOUTH, rough: 0.5 }), I.head), this.mat('solid'), { shadow: false }).userData.noProject = true;
    // the open mouth (a yawn, a big smile): shrunk to a speck until needed
    const m0 = onSurface(geo, [0, MOUTH_AT[1] - 0.005, MOUTH_AT[2]], 0.0);
    const inside = new THREE.SphereGeometry(1, 28, 16);
    inside.deleteAttribute('uv');
    inside.scale(0.0125, 0.0058, 0.0024);
    const ip = inside.attributes.position;
    for (let i = 0; i < ip.count; i++) {
      const x = ip.getX(i), y = ip.getY(i);
      ip.setY(i, y + (y > 0 ? 0.0035 * (x / 0.0125) ** 2 : 0.0012 * (x / 0.0125) ** 2));
      ip.setZ(i, ip.getZ(i) - (x * x) / (2 * 0.028));
    }
    inside.computeVertexNormals();
    inside.translate(0, MOUTH_AT[1] - 0.005, m0[2] + 0.0012);
    const tongue = new THREE.SphereGeometry(1, 20, 12);
    tongue.deleteAttribute('uv');
    tongue.scale(0.0068, 0.0026, 0.0034).translate(0, MOUTH_AT[1] - 0.0082, m0[2] + 0.0016);
    tiny(inside, MOUTH_AT);
    tiny(tongue, MOUTH_AT);
    this.addMesh(bindTo(mergeGeometries([withLook(inside, { tint: MOUTH_IN, rough: 0.5 }), withLook(tongue, { tint: TONGUE, rough: 0.35 })]), I.mouth), this.mat('solid', { clearcoat: 0.6 }), { shadow: false }).userData.noProject = true;
    // the shell: its own glossy lacquered plates
    this.shellMesh = this.addMesh(bindTo(shellGeometry(), I.shell), this.mat('solid', { clearcoat: 1 }), { shadow: true });
    this.shellMesh.userData.region = 2;
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
    tp.y = tp.pitch = tp.roll = tp.yaw = tp.sq = tp.squint = tp.reach = tp.tuck = tp.open = tp.tail = 0;
    tp.head[0] = tp.head[1] = tp.head[2] = 0;
    tp.neck[0] = tp.neck[1] = tp.neck[2] = 0;
    tp.ik = 1;
    tp.legs = tp.after = null;
    if (doing) this.trickPlan(tr, dt, tp);

    // ---- a slow walk on planted feet, diagonal pairs
    const pace = clamp(m.speed / this.walkSpeed, 0, 1.4);
    const moveAmt = Math.max(pace, clamp(Math.abs(yawRate) / 0.8, 0, 0.6)) * (air > 0 ? 0 : 1) * (doing ? 0 : 1);
    this.stepAmt += ((moveAmt > 0.03 ? 1 : 0) - this.stepAmt) * (1 - Math.exp(-dt * 5));
    const hz = lerp(0.8, 1.15, clamp(pace, 0, 1));
    this.phase += dt * hz * (this.stepAmt > 0.01 ? 1 : 0);
    const D = 0.7;
    const S = (m.speed * D) / hz;
    const lift = 0.013 * clamp(pace * 1.5, 0.5, 1) * this.stepAmt;
    for (const k of LEG_KEYS) {
      const L = this.legs[k];
      const ph = (this.phase + GAIT[k]) % 1;
      let dz;
      let y = 0;
      if (ph < D) dz = S / 2 - S * (ph / D);
      else {
        const q = (ph - D) / (1 - D);
        dz = -S / 2 + S * smooth(q);
        y = lift * Math.sin(Math.PI * q);
      }
      L.target.set(L.rest[0], L.rest[1] + y, L.rest[2] + dz * this.stepAmt);
      L.lift = y / 0.013;
    }

    // ---- body: the shell sways and bobs with each step, a slow breath
    const sway = Math.sin(TAU * this.phase) * this.stepAmt;
    const breathe = Math.sin(t * TAU * 0.3);
    root.position.y += Math.abs(Math.cos(TAU * this.phase)) * 0.002 * this.stepAmt - 0.001 * this.stepAmt + breathe * 0.0006 + tp.y;
    root.rotation.set(tp.pitch + 0.015 * Math.sin(TAU * 2 * this.phase) * this.stepAmt, tp.yaw + 0.04 * sway, tp.roll + 0.025 * sway);
    const sq = tp.sq;
    root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    // ---- legs: planted by IK; pulled in when it hides
    this.object.updateMatrixWorld();
    if (tp.legs) {
      for (const k of LEG_KEYS) {
        const a = tp.legs[k];
        if (a) this.legs[k].target.set(a[0], a[1], a[2]);
      }
    }
    const ik = tp.ik * (1 - air) * (1 - tp.tuck);
    for (const k of LEG_KEYS) this.legs[k].solve(root.rotation.x, ik);
    if (air > 0) {
      for (let i = 0; i < 2; i++) {
        const sd = i === 0 ? 1 : -1;
        pose(B[ARM[i]], -0.7 * air, 0, 0.5 * air * sd);
        pose(B[PAW[i]], 0.4 * air, 0, 0);
        pose(B[THIGH[i]], 0.7 * air, 0, 0.5 * air * sd);
        pose(B[FOOT[i]], -0.3 * air, 0, 0);
      }
    }
    if (tp.tuck > 0) {
      // legs drawn in under the shell (the front ones back, the hind ones
      // forwards)
      const k = tp.tuck;
      for (let i = 0; i < 2; i++) {
        const sd = i === 0 ? 1 : -1;
        for (let j = 0; j < 2; j++) {
          const b = B[j === 0 ? ARM[i] : THIGH[i]];
          b.position.x -= 0.03 * k * sd;
          b.position.y += 0.014 * k;
          b.position.z += (j === 0 ? -0.012 : 0.012) * k;
          b.scale.setScalar(1 - 0.5 * k);
        }
      }
      B.tail.position.z += 0.02 * k;
      B.tail.scale.setScalar(1 - 0.5 * k);
    }

    // ---- head: looks about slowly, bobs as it walks, reaches out when
    // curious, pulled in when it hides
    let yaw = Math.sin(t * 0.21 + 1) * 0.5 + Math.sin(t * 0.09) * 0.25;
    let hpitch = Math.sin(t * 0.17) * 0.12;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z - 0.1), -0.9, 0.9);
      hpitch = clamp(-Math.atan2(this.lookLocal.y - 0.09, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.5, 0.4);
    }
    this.tiltT -= dt;
    if (this.tiltT <= 0) {
      this.tiltTo = this.tiltTo !== 0 || Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : -1) * (0.2 + Math.random() * 0.15);
      this.tiltT = this.tiltTo !== 0 ? 1.2 + Math.random() : 2 + Math.random() * 3;
    }
    const tilt = this.tilt.update(this.tiltTo * (1 - this.stepAmt), dt);
    const hy = this.headYaw.update(yaw * (1 - this.stepAmt * 0.5) * (1 - tp.tuck), dt);
    const hp = this.headPitch.update(hpitch - root.rotation.x, dt);
    // the neck: out a little with each step, in when hiding
    const nod = Math.sin(TAU * 2 * this.phase + 0.6) * this.stepAmt;
    const out = 0.004 * nod + tp.reach * 0.022 - tp.tuck * 0.1;
    B.neck0.position.z += out * 0.5;
    B.neck1.position.z += out * 0.5;
    B.neck0.position.y -= tp.tuck * 0.012;
    B.neck1.position.y -= tp.tuck * 0.014 - tp.reach * 0.012;
    B.head.position.y += tp.reach * 0.012;
    pose(B.neck0, hp * 0.3 + tp.neck[0] + 0.06 * nod, hy * 0.4 + tp.neck[1], tp.neck[2]);
    pose(B.neck1, hp * 0.3, hy * 0.3, 0);
    pose(B.head, hp * 0.4 + tp.head[0], hy * 0.3 + tp.head[1], tilt + tp.head[2]);
    B.head.scale.setScalar(1 - 0.2 * tp.tuck);
    const open = clamp(tp.open, 0, 1);
    const shown = smooth(open / 0.06);
    B.mouth.scale.set(Math.max(1e-4, shown * (0.8 + 0.2 * open)) / TINY, Math.max(1e-4, open) / TINY, Math.max(1e-4, shown) / TINY);

    // ---- the tail wags a little with each step
    const tw = this.tail.update(Math.sin(TAU * this.phase) * 0.35 * this.stepAmt + tp.tail, dt);
    pose(B.tail, -0.1 * air, tw, 0);
    pose(B.tailTip, 0, tw * 0.6, 0);

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
    if (tr.name === 'hide') {
      // in it goes, the shell drops with a bump, trembles; the eyes peek
      // out, look about, and out it pops with a smile
      const tuck = ramp(t, 0.15, 0.4) * (1 - ramp(t, 2.3, 2.75));
      const peek = ramp(t, 1.45, 1.7) * (1 - ramp(t, 2.25, 2.35));
      tp.tuck = Math.max(0, tuck - 0.45 * peek);
      tp.y = -0.026 * tuck + 0.006 * bump(t, 2.5, 2.9);
      tp.sq = 0.06 * bump(t, 0.38, 0.6) - 0.04 * bump(t, 2.5, 2.9);
      tp.roll = Math.sin(t * 40) * 0.012 * bump(t, 0.7, 1.35);
      tp.head[0] = 0.2 * peek;
      tp.head[1] = Math.sin((t - 1.7) * 3.5) * 0.5 * ramp(t, 1.7, 1.8) * (1 - ramp(t, 2.2, 2.3));
      tp.squint = 0.9 * bump(t, 0.05, 0.5) + 0.9 * ramp(t, 2.7, 2.8) * (1 - ramp(t, 3.1, 3.2));
      tp.open = 0.7 * bump(t, 2.6, 3.2);
      if (!tr.fired && t > 0.25) {
        tr.fired = true;
        this.emit('sound', { name: 'hide' });
      }
      if (!tr.bump && t > 0.42) {
        tr.bump = true;
        this.emit('land', { at: this.groundPoint(0.005) });
      }
      if (!tr.peek && t > 1.5) {
        tr.peek = true;
        this.emit('sound', { name: 'peek' });
      }
      if (!tr.out && t > 2.55) {
        tr.out = true;
        this.emit('sparkle', { at: this.bonePoint('head', [0, 0.03, 0.02]), count: 26, colors: SPARKS, up: 0.7, speed: 0.55, size: 0.02 });
        this.emit('sound', { name: 'happy' });
        this.happy.kick(3);
      }
    } else if (tr.name === 'spin') {
      // a hop, over onto its back, round and round on its shell with its
      // legs waving, and a hop back over
      const f1 = smooth((t - 0.35) / 0.5);
      const f2 = smooth((t - 2.75) / 0.55);
      const roll = Math.PI * (f1 + f2);
      const hop = bump(t, 0.3, 0.9) * 0.05 + bump(t, 2.7, 3.35) * 0.05;
      const back = f1 * (1 - f2);
      const u = clamp((t - 0.9) / 1.8, 0, 1);
      tp.roll = roll;
      tp.yaw = TAU * 2 * smooth(u);
      tp.y = hop * this.hopScale + 0.003 * back;
      tp.sq = 0.08 * bump(t, 0.15, 0.35) + 0.08 * bump(t, 2.55, 2.75) + 0.06 * bump(t, 3.3, 3.55);
      tp.ik = 1 - smooth((t - 0.25) / 0.2) * (1 - smooth((t - 3.2) / 0.25));
      tp.squint = 0.9 * ramp(t, 1.0, 1.1) * (1 - ramp(t, 2.6, 2.7)) + 0.9 * bump(t, 3.4, 3.9);
      tp.open = 0.7 * ramp(t, 1.0, 1.2) * (1 - ramp(t, 2.5, 2.7)) + 0.6 * bump(t, 3.4, 3.9);
      // upside down, it curls its head up off the ground to look about
      tp.neck[0] = 0.7 * back;
      tp.head[0] = 0.5 * back;
      tp.tail = Math.sin(t * 14) * 0.6 * back;
      // legs waving in the air (posed after the rest)
      tp.after = 'spin';
      tp.a = t;
      tp.b = back;
      if (!tr.fired && t > 0.35) {
        tr.fired = true;
        this.emit('sound', { name: 'spin' });
      }
      tr.nextFx ??= 1.0;
      if (t > tr.nextFx && t < 2.6) {
        tr.nextFx = t + 0.35;
        this.emit('sparkle', { at: this.groundPoint(0.02), count: 12, colors: SPARKS, up: 0.6, speed: 0.6, size: 0.016 });
      }
      if (!tr.land && t > 3.3) {
        tr.land = true;
        this.emit('land', { at: this.groundPoint(0.005) });
        this.emit('sound', { name: 'happy' });
        this.happy.kick(3);
      }
    } else if (tr.name === 'stretch') {
      // up on its legs, the neck stretches up long with a big yawn, a leg
      // stretch each, then a big smile
      const up = ramp(t, 0.1, 0.6) * (1 - ramp(t, 2.9, 3.3));
      const neck = ramp(t, 0.35, 0.95) * (1 - ramp(t, 2.0, 2.5));
      const yawn = bump(t, 0.8, 1.9);
      tp.y = 0.012 * up;
      tp.reach = 0.85 * neck;
      tp.neck[0] = -0.36 * neck;
      tp.head[0] = -0.32 * neck + 0.15 * bump(t, 2.8, 3.4);
      tp.head[2] = 0.1 * Math.sin(t * 2) * neck;
      tp.open = Math.max(yawn, 0.6 * bump(t, 2.9, 3.7));
      tp.squint = 0.9 * Math.max(ramp(t, 0.8, 0.9) * (1 - ramp(t, 1.9, 2.0)), bump(t, 2.9, 3.8));
      tp.pitch = -0.05 * neck;
      // one leg at a time: front left forward, then hind right back
      const s1 = bump(t, 1.9, 2.5), s2 = bump(t, 2.3, 2.9);
      const lg = tp.legPlan;
      lg.FR = lg.HL = null;
      const FLr = this.legs.FL.rest, HRr = this.legs.HR.rest;
      lg.FL = set3(tp.legAt.FL, FLr[0] + 0.004 * s1, FLr[1] + 0.012 * s1, FLr[2] + 0.028 * s1);
      lg.HR = set3(tp.legAt.HR, HRr[0], HRr[1] + 0.01 * s2, HRr[2] - 0.026 * s2);
      tp.legs = lg;
      tp.tail = 0.3 * Math.sin(t * 6) * s2;
      if (!tr.fired && t > 0.8) {
        tr.fired = true;
        this.emit('sound', { name: 'stretch' });
      }
      if (!tr.smile && t > 2.95) {
        tr.smile = true;
        this.emit('sparkle', { at: this.bonePoint('head', [0, 0.035, 0.02]), count: 26, colors: SPARKS, up: 0.8, speed: 0.5, size: 0.02 });
        this.emit('sound', { name: 'happy' });
        this.happy.kick(3);
      }
    }
  }

  // what a trick poses after the rest of the pose
  afterPose(tp) {
    const B = this.bones;
    if (tp.after === 'spin') {
      // legs waving in the air
      const t = tp.a;
      const wave = tp.b;
      const lift = smooth((t - 0.25) / 0.2) * (1 - smooth((t - 3.2) / 0.25));
      for (let i = 0; i < 2; i++) {
        const sd = i === 0 ? 1 : -1;
        const w1 = Math.sin(t * 12 + (sd > 0 ? 0 : 1.5));
        const w2 = Math.sin(t * 12 + (sd > 0 ? 2.4 : 3.9));
        pose(B[ARM[i]], lerp(B[ARM[i]].rotation.x, -0.5 + 0.35 * w1 * wave, lift), 0, lerp(0, sd * (0.5 + 0.2 * w2 * wave), lift));
        pose(B[THIGH[i]], lerp(B[THIGH[i]].rotation.x, 0.5 + 0.35 * w2 * wave, lift), 0, lerp(0, sd * (0.5 + 0.2 * w1 * wave), lift));
        pose(B[FORE[i]], lerp(B[FORE[i]].rotation.x, 0, lift), 0, 0);
        pose(B[SHIN[i]], lerp(B[SHIN[i]].rotation.x, 0, lift), 0, 0);
      }
    }
  }

  // a world point on the ground under the turtle (or under p)
  groundPoint(lift = 0, p = null) {
    const g = this.object.getWorldPosition(new THREE.Vector3());
    const out = p ? p.clone() : this.worldCenter();
    out.y = g.y + lift;
    return out;
  }

  trickLength(name) {
    return { hide: 3.4, spin: 4.0, stretch: 3.9 }[name] || 2;
  }
}

// ------------------------------------------------------------ sounds

// a soft wooden knock (the shell)
function knock(a, t, v = 0.1) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(260, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g).connect(a.sfx);
  o.start(t);
  o.stop(t + 0.25);
}

export const calls = {
  // a soft round 'boop-boop' and a chime
  happy: (a, t) => {
    glide(a, t, [[0, 520], [0.07, 700], [0.14, 640]], { v: 0.08, type: 'sine', formant: 800, q: 0.9 });
    glide(a, t + 0.17, [[0, 620], [0.07, 830], [0.14, 760]], { v: 0.07, type: 'sine', formant: 900, q: 0.9 });
    a.bell(1568, 0.03, t + 0.34, 0.6);
  },
  // a swish in, and the shell's bump on the ground
  hide: (a, t) => {
    puff(a, t, { v: 0.05, from: 1200, to: 500, dur: 0.25 });
    knock(a, t + 0.17, 0.1);
  },
  // peeking out: three little rising notes
  peek: (a, t) => {
    [1175, 1397, 1760].forEach((f, i) => a.bell(f, 0.03, t + i * 0.16, 0.5));
  },
  // whee: whooshes round and round, bells
  spin: (a, t) => {
    glide(a, t, [[0, 600], [0.3, 1000], [0.7, 850]], { v: 0.06, type: 'sine', formant: 1000, vibrato: 12 });
    for (let i = 0; i < 4; i++) puff(a, t + 0.5 + i * 0.45, { v: 0.04, from: 400, to: 1300, dur: 0.4 });
    [1319, 1568, 1760, 2093].forEach((f, i) => a.bell(f, 0.025, t + 0.6 + i * 0.4, 0.6));
  },
  // a big soft yawn (a slow sine, no voice) and a chime
  stretch: (a, t) => {
    glide(a, t, [[0, 420], [0.35, 620], [0.9, 380]], { v: 0.06, type: 'sine', formant: 600, q: 0.8, vibrato: 6, attack: 0.08 });
    a.bell(1319, 0.025, t + 1.1, 0.8);
  },
};
