// Teddy, a plush teddy bear: soft short mohair fur in the child's colours, a
// cream tummy and muzzle, big glossy amber eyes, a shiny button nose over a
// stitched smile, round ears with felt insides, felt paw pads and soles
// ringed with stitches, a stitched seam down the tummy and a red satin bow
// at the neck.
//
// He waddles: short legs swing from the hips, the body rocks over each
// planted foot and the arms swing the other way, the head bobbing a beat
// behind; ears jiggle on springs.
//
// Tricks: 'hug' (opens his arms wide, then squeezes himself in a big hug,
// rocking happily), 'tumble' (tucks in and rolls a somersault, then pops up
// with his arms high) and 'wave' (waves hello with one paw, bouncing on his
// toes).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { withLook, bindTo, tintBy } from './parts.js';
import { fieldOf, hit, grad, stripUv, mergeAll, mergeSkinned } from './shape-kit.js';
import { bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp, easeOutBack } from './anim.js';
import { glide, puff } from '../sound/calls.js';

const FUR = 0xb07a45;
const CREAM = 0xe8c9a0;
const PAD = 0xefdcbc;
const NOSE = 0x22150e;
const MOUTH = 0x3a2016;
const THREAD = 0x4a2d1a;
const BOW = 0xd7263d;

const HEAD = { c: [0, 0.218, 0.004], r: [0.076, 0.066, 0.064] };
const EYE_R = 0.0205;
// shoulder and hip pivots
const SHOULDER = [0.05, 0.148, 0.004];
const HIP = [0.034, 0.068, 0];
const PAW = [0.08, 0.09, 0.022];
// the legs' length (hip to sole) and swing, for steps that don't slide
const LEG = 0.068;
const SWING = 0.42;

export class Teddy extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.furry = true;
    this.hideOpts = { sheen: 1, clearcoat: 0 };
    this.shared.uFurLen.value = 0.0058;
    this.shared.uStrand.value = 0.0014;
    this.shared.uComb.value.set(0, -0.3, -0.18);
    this.shared.uSplat.value = 0.22;
    this.walkSpeed = 0.17;
    this.turnRate = 2.2;
    this.hopScale = 1;
    this.sparkleColors = [[1.9, 1.3, 1.1], [1.9, 1.7, 1.0], [1.5, 1.1, 1.9]];
    this.phase = 0;
    this.walk = 0;
    this.headYaw = new Spring(0, 1.6, 0.7);
    this.headPitch = new Spring(0, 1.6, 0.7);
    this.nod = new Spring(0, 3.0, 0.3);
    this.sway = new Spring(0, 2.4, 0.35);
    this.earL = new Spring(0, 3.6, 0.22);
    this.earR = new Spring(0, 3.6, 0.22);
    this.armS = new Spring(0, 2.6, 0.3);
    this.lastBob = 0;
    this.shiftIn = 3;
  }

  get tricks() {
    return ['hug', 'tumble', 'wave'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0, 0]);
    s.bone('body', 'root', [0, 0.068, 0]);
    s.bone('chest', 'body', [0, 0.125, 0]);
    s.bone('head', 'chest', [0, 0.168, 0.004]);
    s.bones2('ear', 'head', [0.054, 0.258, -0.004]);
    s.bones2('arm', 'chest', SHOULDER);
    s.bones2('leg', 'body', HIP);

    // eyes, found on the head
    const FH = fieldOf([
      { type: 0, c: HEAD.c, r: HEAD.r, k: 0.001, m: null, sub: false },
      { type: 0, c: [0.038, 0.198, 0.03], r: [0.034, 0.028, 0.032], k: 0.03, m: null, sub: false },
      { type: 0, c: [-0.038, 0.198, 0.03], r: [0.034, 0.028, 0.032], k: 0.03, m: null, sub: false },
    ]);
    const pe = hit(FH, [0.029, 0.231, 0.0], [0.26, 0.05, 1]);
    const ne = grad(FH, pe);
    this.eyeC = [pe[0] - ne[0] * EYE_R * 0.42, pe[1] - ne[1] * EYE_R * 0.42, pe[2] - ne[2] * EYE_R * 0.42];
    this.eyeBones(s, this.eyeC, 'head');

    const fur = { tint: FUR, paint: 1, fur: 1, rough: 0.8, pat: 0 };
    const felt = { tint: PAD, paint: 0.1, fur: 0, rough: 0.95 };
    s.setLook(fur);
    // a round tummy and chest
    s.ellipsoid([0, 0.098, 0], [0.066, 0.064, 0.056], { bone: 'body', k: 0.001 });
    s.ellipsoid([0, 0.142, 0.002], [0.055, 0.042, 0.047], { bone: 'chest', k: 0.03 });
    s.ellipsoid([0, 0.097, 0.027], [0.043, 0.047, 0.033], { bone: 'body', k: 0.02, tint: CREAM, paint: 0.3, fur: 0.75 });
    // short legs with big feet
    s.cone(HIP, [0.038, 0.03, 0.006], 0.029, 0.026, { bone: 'legL', k: 0.02, sym: true });
    s.ellipsoid([0.039, 0.022, 0.017], [0.027, 0.022, 0.04], { bone: 'legL', k: 0.02, sym: true });
    // arms hanging a little forward, with felt pads on the paws
    s.cone(SHOULDER, PAW, 0.023, 0.021, { bone: 'armL', k: 0.022, sym: true });
    this.padC = [PAW[0] + 0.001, PAW[1] - 0.004, PAW[2] + 0.017];
    s.ellipsoid(this.padC, [0.0125, 0.0148, 0.0062], { bone: 'armL', k: 0.004, sym: true, ...felt, rot: [0.35, 0.25, 0] });
    // the head: round, with chubby cheeks
    s.ellipsoid(HEAD.c, HEAD.r, { bone: 'head', k: 0.03 });
    s.ellipsoid([0.038, 0.198, 0.03], [0.034, 0.028, 0.032], { bone: 'head', k: 0.03, sym: true });
    // short fur round the eyes
    s.sphere(this.eyeC, EYE_R * 0.78, { bone: 'head', k: 0.006, sym: true, fur: 0.1 });
    // the muzzle
    s.ellipsoid([0, 0.196, 0.05], [0.033, 0.025, 0.026], { bone: 'head', k: 0.016, tint: CREAM, paint: 0.2, fur: 0.3 });
    // round ears, cupped, with felt insides
    s.ellipsoid([0.056, 0.26, -0.004], [0.027, 0.026, 0.013], { bone: 'earL', k: 0.012, sym: true, rot: [0, 0, -0.4] });
    s.ellipsoid([0.058, 0.258, 0.009], [0.0165, 0.0165, 0.0085], { bone: 'earL', k: 0.004, sym: true, sub: true, rot: [0, 0, -0.4], ...felt, paint: 0.15, fur: 0.12 });
    // flat felt soles
    s.box([0.04, -0.1, 0.01], [0.045, 0.1, 0.08], 0, { bone: 'legL', sub: true, sym: true, k: 0.004, ...felt });

    // the stitched smile and the line up to the nose, and the tummy seam
    const F1 = fieldOf(s.prims.filter((p) => p.type === 0 && !p.sub));
    this.smile = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const p = hit(F1, [u * 0.0195, 0.1845 + 0.0095 * u * u, 0.03], [0, 0, 1]);
      this.smile.push([p[0], p[1], p[2] + 0.0012]);
    }
    s.chain(this.smile, this.smile.map((_, i) => {
      const u = (i / (n - 1)) * 2 - 1;
      return 0.0017 + 0.0028 * (1 - u * u);
    }), { bone: 'head', sub: true, k: 0.0016, tint: MOUTH, paint: 0, fur: 0, rough: 0.7 });
    const nb = hit(F1, [0, 0.2, 0.03], [0, 0, 1]);
    this.noseBase = nb;
    s.cone([0, 0.2, nb[2] + 0.0008], [0, this.smile[4][1] + 0.002, this.smile[4][2] - 0.0005], 0.0011, 0.0011, { bone: 'head', sub: true, k: 0.0012, tint: MOUTH, paint: 0, fur: 0, rough: 0.7 });
    this.seam = [];
    for (let i = 0; i <= 6; i++) {
      const y = 0.135 - i * 0.012;
      const p = hit(F1, [0, y, 0], [0, 0, 1]);
      this.seam.push(p);
    }
    s.chain(this.seam.map((p) => [p[0], p[1], p[2] + 0.0006]), this.seam.map(() => 0.0016), { bone: 'body', sub: true, k: 0.002, tint: CREAM, paint: 0.3, fur: 0.05 });
  }

  parts(s) {
    const I = s.index;
    const F = fieldOf(s.prims);
    const q = this.q.tier === 'low' ? 0.6 : this.q.tier === 'medium' ? 0.8 : 1;

    this.addEyes(s, {
      c: this.eyeC,
      r: EYE_R,
      dir: [0.3, 0.05, 1],
      bone: 'head',
      iris: 0x8a531f,
      iris2: 0x3a1e0a,
      irisSize: 0.93,
      pupil: 0.46,
      lid: { tint: FUR, paint: 1, fur: 0.3, rough: 0.8, open: -0.42, closed: 1.6 },
    });

    // a shiny button nose
    {
      const p = hit(F, [0, 0.206, 0.03], [0, 0.18, 1]);
      const nn = grad(F, p);
      const g = new THREE.SphereGeometry(1, Math.round(28 * q), 16);
      g.scale(0.0128, 0.0092, 0.0078);
      g.rotateX(-0.3);
      g.translate(p[0] + nn[0] * 0.003, p[1] + nn[1] * 0.003 - 0.001, p[2] + nn[2] * 0.003);
      withLook(stripUv(g), { tint: NOSE, rough: 0.18 });
      bindTo(g, I.head);
      this.addMesh(g, this.mat('solid', { clearcoat: 1 }), { shadow: true }).userData.region = 40;
    }

    // stitches: rings round the paw pads and a running stitch down the tummy
    {
      const dashes = [];
      const dash = (a, b, bone) => {
        const A = new THREE.Vector3(...a);
        const Bv = new THREE.Vector3(...b);
        const d = Bv.clone().sub(A);
        const g = new THREE.CapsuleGeometry(0.00065, Math.max(0.0005, d.length() - 0.0013), 2, 6);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
        const m = A.add(Bv).multiplyScalar(0.5);
        g.translate(m.x, m.y, m.z);
        dashes.push(bindTo(withLook(stripUv(g), { tint: THREAD, rough: 0.85 }), bone));
      };
      for (const side of [1, -1]) {
        const c = [this.padC[0] * side, this.padC[1], this.padC[2]];
        const o = [c[0] - 0.01 * side * 0.25, c[1], c[2] - 0.012];
        const p0 = hit(F, o, [0.25 * side, 0.34, 1]);
        const nn = new THREE.Vector3(...grad(F, p0));
        const u = new THREE.Vector3(0, 1, 0).cross(nn).normalize();
        const v = nn.clone().cross(u).normalize();
        const ring = [];
        const N = 12;
        for (let i = 0; i < N; i++) {
          const a = (i / N) * TAU;
          const q0 = new THREE.Vector3(...p0).addScaledVector(u, Math.cos(a) * 0.0145).addScaledVector(v, Math.sin(a) * 0.0168);
          const start = q0.clone().addScaledVector(nn, -0.012);
          const ph = hit(F, start.toArray(), nn.toArray(), 0.05);
          const g2 = grad(F, ph);
          ring.push([ph[0] + g2[0] * 0.0009, ph[1] + g2[1] * 0.0009, ph[2] + g2[2] * 0.0009]);
        }
        const bone = I['arm' + (side > 0 ? 'L' : 'R')];
        for (let i = 0; i < N; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % N];
          dash(a, [lerp(a[0], b[0], 0.6), lerp(a[1], b[1], 0.6), lerp(a[2], b[2], 0.6)], bone);
        }
      }
      for (let i = 0; i < this.seam.length - 1; i++) {
        const a = this.seam[i];
        const b = this.seam[i + 1];
        const nn = grad(F, a);
        const lift = (p) => [p[0] + nn[0] * 0.0012, p[1] + nn[1] * 0.0012, p[2] + nn[2] * 0.0012];
        // little cross stitches over the seam
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        dash(lift([m[0] - 0.0028, m[1] + 0.0028, m[2]]), lift([m[0] + 0.0028, m[1] - 0.0028, m[2]]), I.body);
        dash(lift([m[0] + 0.0028, m[1] + 0.0028, m[2]]), lift([m[0] - 0.0028, m[1] - 0.0028, m[2]]), I.body);
      }
      const g = mergeSkinned(dashes);
      const m = this.addMesh(g, this.mat('solid'), { shadow: false });
      m.userData.noProject = true;
    }

    // ---- the satin bow: a band round the neck, two puffy loops, a knot and
    // two tails with notched ends
    {
      const parts = [];
      const y0 = 0.158;
      const band = [];
      const N = Math.round(56 * q);
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU;
        const p = hit(F, [0, y0, 0.0], [Math.sin(a), 0, Math.cos(a)]);
        const nn = grad(F, p);
        const h = Math.hypot(nn[0], nn[2]) || 1;
        band.push([p[0] + (nn[0] / h) * 0.0042, p[1], p[2] + (nn[2] / h) * 0.0042, nn[0] / h, nn[2] / h]);
      }
      parts.push(bandGeometry(band, 0.0105, 0.0016));
      const front = band[0];
      const kc = [0, y0 + 0.001, front[2] + 0.004];
      for (const side of [1, -1]) parts.push(loopGeometry([kc[0] + side * 0.0205, kc[1] + 0.0035, kc[2] - 0.001], side, q));
      const knot = new THREE.SphereGeometry(1, 20, 14);
      knot.scale(0.0075, 0.0068, 0.0052);
      knot.translate(kc[0], kc[1], kc[2] + 0.002);
      parts.push(knot);
      for (const side of [1, -1]) parts.push(tailGeometry([kc[0] + side * 0.002, kc[1] - 0.003, kc[2] + 0.001], side));
      const g = mergeAll(parts.map(stripUv));
      withLook(g, { tint: BOW, paint: 0.05, rough: 0.35 });
      tintBy(g, (x, y, z, c) => c.setHex(BOW));
      bindTo(g, I.chest);
      const mat = this.mat('solid', { clearcoat: 0.5, side: THREE.DoubleSide });
      mat.sheen = 1;
      mat.sheenRoughness = 0.3;
      mat.sheenColor = new THREE.Color(1, 0.45, 0.45);
      this.addMesh(g, mat, { shadow: true }).userData.region = 41;
    }
  }

  // ------------------------------------------------------------ motion

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    const sp = m.speed;
    const air = m.air;
    this.blinker.hold = 0;

    // the waddle: a step cycle that keeps the planted foot still
    const walking = clamp(sp / 0.05, 0, 1) * (1 - air);
    this.walk = lerp(this.walk, walking, 1 - Math.exp(-dt * 6));
    const w = this.walk;
    if (sp > 0.005) this.phase += (dt * sp) / (LEG * SWING);
    else {
      // settle the legs back under him
      const target = Math.round(this.phase / Math.PI) * Math.PI;
      this.phase = lerp(this.phase, target, 1 - Math.exp(-dt * 5));
    }
    const ph = this.phase;
    const sw = Math.sin(ph) * SWING * w;
    B.legL.rotation.x = sw;
    B.legR.rotation.x = -sw;
    B.legL.position.y += Math.max(0, -Math.cos(ph)) * 0.009 * w;
    B.legR.position.y += Math.max(0, Math.cos(ph)) * 0.009 * w;
    // rock over the planted foot, bob twice a cycle, swing the arms
    const rock = -Math.cos(ph) * 0.12 * w;
    const bob = (1 - Math.abs(Math.sin(ph))) * 0.005 * w;
    const bobV = (bob - this.lastBob) / Math.max(dt, 1e-4);
    this.lastBob = bob;

    // alive: breathing, a weight shift now and then
    const breathe = Math.sin(t * 2.1);
    this.shiftIn -= dt;
    if (this.shiftIn <= 0) {
      this.shiftIn = 2.5 + Math.random() * 3.5;
      this.sway.kick((Math.random() - 0.5) * 1.6 * (1 - w));
      this.nod.kick(-0.6 - Math.random() * 0.6);
    }
    const sway = this.sway.update(0, dt);
    B.body.rotation.z = rock + sway * 0.06 + Math.sin(t * 0.7) * 0.012 * (1 - w);
    B.body.position.y += bob + breathe * 0.0006;
    B.body.rotation.x = w * 0.05 + Math.sin(t * 0.5) * 0.01;
    B.root.rotation.y = Math.sin(ph) * 0.07 * w;
    B.chest.scale.set(1 + breathe * 0.012, 1 + breathe * 0.008, 1 + breathe * 0.014);

    // arms: swing with the steps and hang a little out
    this.armS.kick(-sway * dt * 2);
    const as = this.armS.update(0, dt);
    B.armL.rotation.set(-sw * 0.9 - 0.05, 0, 0.12 + w * 0.14 + as * 0.3 + breathe * 0.02);
    B.armR.rotation.set(sw * 0.9 - 0.05, 0, -0.12 - w * 0.14 + as * 0.3 - breathe * 0.02);

    // the head looks about, a beat behind the body
    let yawT = Math.sin(t * 0.33) * 0.35 + Math.sin(t * 0.13) * 0.25;
    let pitchT = Math.sin(t * 0.27) * 0.12;
    if (this.lookLocal) {
      yawT = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z), -1, 1);
      pitchT = clamp(-(this.lookLocal.y - 0.22) * 0.8, -0.35, 0.35);
    }
    const hy = this.headYaw.update(yawT, dt);
    const hp = this.headPitch.update(pitchT, dt);
    this.nod.kick(-bobV * dt * 0.8);
    const nod = this.nod.update(0, dt);
    B.head.rotation.set(hp * 0.5 + nod * 0.12, hy * 0.55, -rock * 0.6 + Math.sin(t * 0.41) * 0.06 + sway * 0.05);

    // ears jiggle
    this.earL.kick(-bobV * dt * 8 + rock * dt * 2);
    this.earR.kick(-bobV * dt * 8 - rock * dt * 2);
    const el = this.earL.update(0, dt);
    const er = this.earR.update(0, dt);
    B.earL.rotation.set(el * 0.3, 0, el * 0.4 - hy * 0.05);
    B.earR.rotation.set(er * 0.3, 0, -er * 0.4 - hy * 0.05);

    // in the leap: arms up, feet tucked
    if (air > 0) {
      const a = air * (1 - air * 0.3);
      B.armL.rotation.z += a * 1.6;
      B.armR.rotation.z -= a * 1.6;
      B.armL.rotation.x -= a * 0.4;
      B.armR.rotation.x -= a * 0.4;
      B.legL.rotation.x -= a * 0.5;
      B.legR.rotation.x -= a * 0.5;
      B.head.rotation.x -= a * 0.2;
    }

    if (this.trick) this.trickPose(this.trick, dt);
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'hug') {
      // arms flung wide, then a big squeeze, rocking happily
      const open = ramp(t, 0.05, 0.45) * (1 - ramp(t, 0.5, 0.68));
      const hugK = ramp(t, 0.52, 0.72) * (1 - ramp(t, 2.25, 2.7));
      B.armL.rotation.z += open * 1.25 - hugK * 0.5;
      B.armR.rotation.z -= open * 1.25 - hugK * 0.5;
      B.armL.rotation.x -= open * 0.35 + hugK * 1.25;
      B.armR.rotation.x -= open * 0.35 + hugK * 1.25;
      B.armL.rotation.y -= hugK * 0.5;
      B.armR.rotation.y += hugK * 0.5;
      B.body.rotation.x -= open * 0.1 - hugK * 0.06;
      B.head.rotation.x -= open * 0.2;
      const rockH = Math.sin((t - 0.7) * 6) * 0.13 * hugK;
      B.body.rotation.z += rockH;
      B.head.rotation.z += rockH * 0.8;
      const squeeze = hugK * (0.5 + 0.5 * Math.sin((t - 0.7) * 12));
      B.chest.scale.x *= 1 - squeeze * 0.05;
      B.chest.scale.y *= 1 + squeeze * 0.03;
      this.blinker.hold = Math.max(open * -0.2, hugK * 0.75);
      if (!tr.a && t > 0.05) {
        tr.a = true;
        this.emit('sound', { name: 'ooh' });
      }
      if (!tr.b && t > 0.6) {
        tr.b = true;
        this.emit('sound', { name: 'hug' });
        this.emit('sparkle', { at: this.restPoint('chest', [0, 0.16, 0.08]), count: 26, colors: [[2.0, 0.9, 1.2], [1.9, 1.3, 1.5], [1.9, 1.7, 1.0]], speed: 0.6, up: 0.7, size: 0.02 });
      }
      if (!tr.c && t > 1.6) {
        tr.c = true;
        this.emit('sound', { name: 'happy' });
      }
      return;
    }
    if (tr.name === 'tumble') {
      // crouch and tuck, roll right over, then pop up with arms high
      const crouch = ramp(t, 0, 0.35) * (1 - ramp(t, 0.35, 0.5));
      const k = clamp((t - 0.4) / 0.85, 0, 1);
      const roll = smooth(k);
      const tuck = bump(t, 0.3, 1.3);
      B.body.position.y -= crouch * 0.014;
      B.head.rotation.x += crouch * 0.35 + tuck * 0.45;
      B.armL.rotation.x -= tuck * 1.3;
      B.armR.rotation.x -= tuck * 1.3;
      B.armL.rotation.z -= tuck * 0.2;
      B.armR.rotation.z += tuck * 0.2;
      B.legL.rotation.x -= tuck * 0.8;
      B.legR.rotation.x -= tuck * 0.8;
      // roll about the middle of the body, hopping up a little
      const th = roll * TAU;
      const c = 0.12;
      const root = B.root;
      root.rotation.x += th;
      root.position.y += c - c * Math.cos(th) + Math.sin(k * Math.PI) * 0.05;
      root.position.z += -c * Math.sin(th);
      const ball = tuck * 0.08;
      root.scale.set(1 + ball * 0.3, 1 - ball, 1 + ball * 0.3);
      this.blinker.hold = tuck * 0.9;
      if (!tr.a && t > 0.35) {
        tr.a = true;
        this.emit('sound', { name: 'roll' });
      }
      if (!tr.land && t > 1.25) {
        tr.land = true;
        this.nod.kick(3);
        this.sway.kick(1.2);
        this.earL.kick(6);
        this.earR.kick(-6);
        this.emit('land', { at: this.restPoint('root', [0, 0, 0.02]) });
        this.emit('sound', { name: 'thump' });
      }
      // ta-da!
      const up = ramp(t, 1.3, 1.55) * (1 - ramp(t, 2.3, 2.75));
      B.armL.rotation.z += up * 2.1;
      B.armR.rotation.z -= up * 2.1;
      B.armL.rotation.x -= up * 0.2;
      B.armR.rotation.x -= up * 0.2;
      B.body.position.y += Math.max(0, Math.sin(clamp((t - 1.3) / 0.35, 0, 1) * Math.PI)) * 0.015;
      B.head.rotation.z += wobble(t - 1.3, 1.6, 1.0) * 0.12;
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 1.45, 2.4) * 0.55);
      if (!tr.tada && t > 1.4) {
        tr.tada = true;
        this.emit('sound', { name: 'tada' });
        for (const side of [1, -1]) this.emit('sparkle', { at: this.restPoint(side > 0 ? 'armL' : 'armR', [PAW[0] * side, PAW[1], PAW[2]]), count: 16, speed: 0.7, up: 0.8, size: 0.018 });
      }
      return;
    }
    if (tr.name === 'wave') {
      // up goes a paw, waving hello, bouncing on his toes
      const up = ramp(t, 0.05, 0.35) * (1 - ramp(t, 1.9, 2.3));
      const wave = Math.sin((t - 0.35) * 16) * ramp(t, 0.3, 0.45) * (1 - ramp(t, 1.7, 1.95));
      B.armR.rotation.z -= up * 1.9 + wave * 0.36;
      B.armR.rotation.x -= up * 0.5;
      B.armR.rotation.y += wave * 0.2;
      B.armL.rotation.z += up * 0.15;
      B.body.rotation.z += up * 0.07;
      B.head.rotation.z -= up * 0.14;
      const bounce = Math.abs(Math.sin((t - 0.3) * 7.5)) * bump(t, 0.3, 1.9);
      B.root.position.y += bounce * 0.012;
      B.body.scale.set(1 + (1 - bounce) * up * 0.02, 1 - (1 - bounce) * up * 0.03, 1);
      this.earL.kick(Math.cos((t - 0.3) * 7.5) * dt * 12 * up);
      this.earR.kick(-Math.cos((t - 0.3) * 7.5) * dt * 12 * up);
      this.blinker.hold = bump(t, 0.4, 1.9) * 0.45;
      if (!tr.a && t > 0.25) {
        tr.a = true;
        this.emit('sound', { name: 'hello' });
        this.emit('sparkle', { at: this.restPoint('armR', [-0.1, 0.25, 0.03]), count: 14, speed: 0.6, up: 0.6, size: 0.016 });
      }
      if (!tr.b && t > 1.35) {
        tr.b = true;
        this.emit('sound', { name: 'happy' });
      }
    }
  }

  trickLength(name) {
    return { hug: 2.8, tumble: 2.8, wave: 2.4 }[name] || 2;
  }

  restPoint(bone, p) {
    const b = this.sculptor.bones[this.sculptor.index[bone]].pos;
    return this.bonePoint(bone, [p[0] - b[0], p[1] - b[1], p[2] - b[2]]);
  }
}

export const calls = {
  // squeak-squeak, the plush's squeaker, and a music-box ting
  happy(a, t) {
    squeak(a, t, 1250, 0.05, 0.1);
    squeak(a, t + 0.15, 1480, 0.05, 0.12);
    a.bell(2093, 0.022, t + 0.3, 0.6);
  },
  // arms flung wide: a little music-box run
  ooh(a, t) {
    for (const [i, f] of [1047, 1319, 1568].entries()) a.bell(f, 0.03, t + i * 0.08, 0.7);
  },
  // the big squeeze: a long squeak and a soft puff of plush
  hug(a, t) {
    squeak(a, t, 1000, 0.05, 0.32);
    puff(a, t, { v: 0.035, from: 400, to: 800, dur: 0.4 });
    a.bell(1760, 0.022, t + 0.4, 0.8);
  },
  // hello: two music-box notes and a squeak
  hello(a, t) {
    a.bell(1568, 0.03, t, 0.6);
    a.bell(2093, 0.03, t + 0.12, 0.7);
    squeak(a, t + 0.26, 1350, 0.045, 0.1);
  },
  // tumbling over: a slide whistle and a whoosh
  roll(a, t) {
    puff(a, t, { v: 0.07, from: 300, to: 1200, dur: 0.8 });
    glide(a, t, [[0, 500], [0.4, 1000], [0.8, 660]], { type: 'sine', v: 0.045, formant: 1100, q: 0.8 });
  },
  // a soft plush landing
  thump(a, t) {
    puff(a, t, { v: 0.2, from: 260, to: 600, dur: 0.22 });
  },
  // ta-da: a music-box flourish with a squeak on top
  tada(a, t) {
    for (const [i, f] of [523, 659, 784, 1047].entries()) a.bell(f * 2, 0.026, t + i * 0.07, 0.8);
    squeak(a, t + 0.3, 1500, 0.04, 0.1);
  },
};

// the squeaker in a plush toy: a quick rubbery rise and fall, buzzing a
// little, with a breath of air through it
function squeak(a, t, f, v, len) {
  glide(a, t, [[0, f], [len * 0.4, f * 1.3], [len, f * 1.12]], { type: 'square', v, formant: f * 1.6, q: 2.2, trill: 55, trillDepth: 0.35, attack: 0.008 });
  puff(a, t, { v: v * 0.3, from: f * 1.5, to: f * 2, dur: len + 0.04 });
}

// ------------------------------------------------------------ the bow

// a flat ribbon round the neck: pts [x, y, z, nx, nz] with an outward normal
function bandGeometry(pts, width, thick) {
  const pos = [];
  const idx = [];
  const prof = [[-thick / 2, -width / 2], [thick / 2, -width / 2], [thick / 2, width / 2], [-thick / 2, width / 2]];
  for (const [x, y, z, nx, nz] of pts) {
    for (const [o, h] of prof) {
      const r = 0.0013 * Math.pow(Math.abs(h / (width / 2)), 3);
      pos.push(x + nx * (o - r), y + h, z + nz * (o - r));
    }
  }
  const n = pts.length;
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < 4; k++) {
      const a = i * 4 + k;
      const b = i * 4 + ((k + 1) % 4);
      idx.push(a, b, a + 4, b, b + 4, a + 4);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a puffy ribbon loop reaching out to one side from the knot
function loopGeometry(c, side, q) {
  const seg = Math.round(28 * q);
  const ring = 12;
  const pos = [];
  const idx = [];
  const ax = 0.0165, ay = 0.0115;
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * TAU;
    // the path: an oval, pinched where it meets the knot (u = PI)
    const pinch = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(u));
    const px = c[0] + side * ax * Math.cos(u) * (u > Math.PI * 0.5 && u < Math.PI * 1.5 ? 0.9 : 1);
    const py = c[1] + ay * Math.sin(u) * pinch + side * Math.cos(u) * 0.003;
    const tx = -side * ax * Math.sin(u);
    const ty = ay * Math.cos(u);
    const tl = Math.hypot(tx, ty) || 1;
    // cross-section: a flattened tube, wide across the loop, thin in depth
    const nx = ty / tl, ny = -tx / tl;
    const r0 = 0.0044 * (0.55 + 0.45 * pinch);
    for (let j = 0; j <= ring; j++) {
      const v = (j / ring) * TAU;
      const inPlane = Math.cos(v) * r0;
      const depth = Math.sin(v) * r0 * 0.75;
      pos.push(px + nx * inPlane * side, py + ny * inPlane, c[2] + depth + 0.002 * pinch);
    }
  }
  const row = ring + 1;
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < ring; j++) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a ribbon tail hanging from the knot, with a notched end
function tailGeometry(c, side) {
  const pos = [];
  const idx = [];
  const steps = 8;
  const len = 0.03;
  const w = 0.0052;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const x = c[0] + side * (0.004 + u * 0.011);
    const y = c[1] - u * len;
    const z = c[2] + Math.sin(u * Math.PI) * 0.002 - u * 0.002;
    // the notch: the middle of the end is shorter
    for (const k of [-1, 0, 1]) {
      const back = i === steps && k === 0 ? 0.006 : 0;
      pos.push(x + k * w * 0.9, y + back + k * side * u * 0.002, z + Math.abs(k) * 0.0006);
    }
  }
  for (let i = 0; i < steps; i++)
    for (let k = 0; k < 2; k++) {
      const a = i * 3 + k;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
