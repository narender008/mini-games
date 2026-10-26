// Flick, a fox cub: a round fluffy head with huge ears (pale fluffy
// insides, dark tips), fluffy white cheeks and bib, big amber eyes, a
// pointed cream muzzle with a shiny black nose and whiskers, dark socks on
// slim legs, and an enormous bushy tail with a white tip that swishes and
// sways as he moves. Long soft fur carries the child's colours.
//
// Tricks: 'pounce' (crouches, wiggles his bottom, leaps high and dives
// nose-first into the grass, pops up with a shake), 'chase' (spots his own
// tail and chases it round and round, then wobbles, dizzy) and 'wag' (sits
// down and sweeps his big tail from side to side, happy). A light trot.
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { pose, addPose, bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp } from './anim.js';
import { Tracker, Leg, Gait, stepOffset } from './pal-kit.js';
import { glide, puff } from '../sound/calls.js';
import { rand } from '../config.js';

const COAT = 0xf2842a;
const CREAM = 0xfff3e2;
const SOCK = 0x3a2418;
const EARTIP = 0x2e1c14;
const NOSE_C = 0x17110f;
const MOUTH = 0x4a1c1c;
const TONGUE = 0xe86a78;
const INNER = 0xf7e6d8;

// the head is modelled about the middle of the skull, C
const C = [0, 0.21, 0.092];
const HS = 1.12;
const at = (x, y, z) => [C[0] + x * HS, C[1] + y * HS, C[2] + z * HS];
const hv = (v) => v.map((x) => x * HS);
const hr = (r) => r * HS;
const HEAD = at(0, -0.02, -0.014);
const EYE = at(0.021, 0.006, 0.026);
// per-frame constants and scratch (no allocations while animating)
const TROT = [0, 0.5, 0.5, 0];
const TAIL = ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'];
const T_OFF = 0.66; // the pounce: take-off
const T_LAND = 1.28; // ... and landing
const _step = [0, 0];
const NOSE = at(0, -0.017, 0.082);

export class Fox extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.furry = true;
    this.hideOpts = { sheen: 0.9, clearcoat: 0.8 };
    this.shared.uFurLen.value = 0.0085;
    this.shared.uStrand.value = 0.0017;
    this.shared.uComb.value.set(0, -0.3, -0.62);
    this.shared.uSplat.value = 0.2;
    this.walkSpeed = 0.3;
    this.turnRate = 2.6;
    this.hopScale = 0.9;
    this.sparkleColors = [[1.9, 1.3, 0.6], [1.9, 1.7, 1.2], [1.4, 1.1, 1.9]];
    this.phase = 0;
    this.track = new Tracker();
    this.headYaw = new Spring(0, 1.7, 0.75);
    this.headPitch = new Spring(0, 1.7, 0.75);
    this.tailSway = [0, 1, 2, 3, 4].map((i) => new Spring(0, 1.6 - i * 0.12, 0.35));
    this.tailLift = [0, 1, 2, 3, 4].map((i) => new Spring(0, 1.5 - i * 0.12, 0.45));
    this.earL = new Spring(0, 3.2, 0.3);
    this.earR = new Spring(0, 3.2, 0.3);
    this.earTimer = 2;
    this.swishTimer = 3;
    this.swish = new Spring(0, 0.9, 0.3);
    this.sniffT = -1;
    this.sniffTimer = 5;
    this.idleFade = 1; // idle fidgets fade out when a trick or a walk starts
    this.prevBob = 0;
  }

  get tricks() {
    return ['pounce', 'chase', 'wag'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0.116, 0]);
    s.bone('hips', 'root', [0, 0.121, -0.038]);
    s.bone('chest', 'root', [0, 0.121, 0.035]);
    s.bone('neck', 'chest', [0, 0.146, 0.058]);
    s.bone('head', 'neck', HEAD);
    s.bone('jaw', 'head', at(0, -0.024, 0.03));
    this.eyeBones(s, EYE);
    s.bones2('ear', 'head', at(0.026, 0.03, -0.012));
    s.bone('tail0', 'hips', [0, 0.134, -0.08]);
    s.bone('tail1', 'tail0', [0, 0.148, -0.128]);
    s.bone('tail2', 'tail1', [0, 0.146, -0.178]);
    s.bone('tail3', 'tail2', [0, 0.132, -0.223]);
    s.bone('tail4', 'tail3', [0, 0.116, -0.26]);
    s.bones2('shoulder', 'chest', [0.025, 0.108, 0.044]);
    s.bones2('elbow', 'shoulder', [0.025, 0.058, 0.05]);
    s.bones2('paw', 'elbow', [0.025, 0.013, 0.051]);
    s.bones2('thigh', 'hips', [0.027, 0.112, -0.046]);
    s.bones2('knee', 'thigh', [0.027, 0.054, -0.062]);
    s.bones2('foot', 'knee', [0.027, 0.013, -0.05]);

    const fur = { paint: 1, fur: 0.85, rough: 0.75, pat: 0, tint: COAT };
    const cream = { paint: 0.1, fur: 1.3, rough: 0.8, tint: CREAM };
    const sock = { paint: 0.12, fur: 0.55, rough: 0.8, tint: SOCK };
    s.setLook(fur);
    // body: small and round, a fluffy cream bib and belly
    s.ellipsoid([0, 0.124, 0.028], [0.038, 0.041, 0.05], { bone: 'chest', k: 0.03 });
    s.ellipsoid([0, 0.126, -0.036], [0.04, 0.041, 0.046], { bone: 'hips', k: 0.045 });
    s.ellipsoid([0, 0.118, 0.07], [0.029, 0.038, 0.024], { bone: 'chest', k: 0.022, ...cream, fur: 1.7 });
    s.ellipsoid([0, 0.146, 0.074], [0.022, 0.026, 0.02], { bone: 'neck', k: 0.02, ...cream, fur: 1.5 });
    s.ellipsoid([0, 0.101, 0.004], [0.03, 0.024, 0.054], { bone: 'root', k: 0.03, ...cream, paint: 0.3, fur: 1 });
    // neck with a soft ruff
    s.cone([0, 0.132, 0.05], [0, 0.18, 0.074], 0.031, 0.029, { bone: 'neck', k: 0.03, fur: 1.2 });
    // head: a round skull, fluffy white cheeks that flare back, a pointed muzzle
    s.ellipsoid(C, hv([0.047, 0.042, 0.043]), { bone: 'head', k: 0.03, fur: 0.7 });
    s.ellipsoid(at(0.03, -0.02, 0.004), hv([0.021, 0.021, 0.024]), { bone: 'head', k: 0.022, sym: true, ...cream, paint: 0.14, fur: 1.6, rot: [0, 0.3, -0.5] });
    s.ellipsoid(at(0, -0.003, 0.042), hv([0.017, 0.014, 0.03]), { bone: 'head', k: 0.02, fur: 0.25, rot: [0.3, 0, 0] });
    s.cone(at(0, -0.012, 0.03), at(0, -0.018, 0.074), hr(0.02), hr(0.009), { bone: 'head', k: 0.02, fur: 0.3 });
    s.ellipsoid(at(0, -0.025, 0.044), hv([0.016, 0.009, 0.03]), { bone: 'head', k: 0.014, ...cream, fur: 0.3, paint: 0.2, rot: [0.12, 0, 0] });
    // chin on the jaw
    s.ellipsoid(at(0, -0.032, 0.04), hv([0.013, 0.0075, 0.02]), { bone: 'jaw', k: 0.01, ...cream, fur: 0.35 });
    // the nose: a glossy black button with nostrils
    s.ellipsoid(NOSE, hv([0.0085, 0.0068, 0.0065]), { bone: 'head', k: 0.004, tint: NOSE_C, paint: 0, fur: 0, rough: 0.25 });
    s.ellipsoid([0.0035, NOSE[1], NOSE[2] + 0.006], [0.0017, 0.0012, 0.002], { bone: 'head', k: 0.002, sub: true, sym: true, tint: 0x050404, paint: 0, fur: 0, rough: 0.4 });
    // a little smile under the nose
    s.cone([0, NOSE[1] - 0.005, NOSE[2] - 0.002], [0, NOSE[1] - 0.011, NOSE[2] - 0.007], 0.0012, 0.0012, { bone: 'head', k: 0.002, sub: true, tint: MOUTH, paint: 0, fur: 0 });
    s.cone([0, NOSE[1] - 0.011, NOSE[2] - 0.007], [0.011, NOSE[1] - 0.009, NOSE[2] - 0.022], 0.0014, 0.001, { bone: 'head', k: 0.002, sub: true, sym: true, tint: MOUTH, paint: 0, fur: 0 });
    // eye sockets: short fur around the eyes
    s.sphere(EYE, hr(0.0175), { bone: 'head', k: 0.005, sym: true, fur: 0.15 });
    // ears: big pointed triangles leaning out, fluffy pale insides, dark tips
    const ear = (u, w, th, look = {}) => {
      const b = at(0.028, 0.028, -0.012);
      const tip = at(0.054, 0.09, -0.02);
      const p = [lerp(b[0], tip[0], u), lerp(b[1], tip[1], u), lerp(b[2], tip[2], u)];
      s.ellipsoid(p, hv([w, w * 0.9, th]), { bone: 'earL', k: 0.012, sym: true, rot: [0.08, 0, -0.4], ...look });
    };
    ear(0.05, 0.024, 0.009);
    ear(0.35, 0.018, 0.008);
    ear(0.62, 0.0115, 0.006);
    ear(0.84, 0.006, 0.0045, { tint: EARTIP, paint: 0.2, fur: 0.7 });
    ear(0.97, 0.003, 0.003, { tint: EARTIP, paint: 0.2, fur: 0.6 });
    s.ellipsoid(at(0.031, 0.044, -0.004), hv([0.013, 0.022, 0.0045]), { bone: 'earL', k: 0.006, sym: true, sub: true, rot: [0.08, 0, -0.4], tint: INNER, paint: 0.1, fur: 1.9 });
    // front legs: slim, dark socks, neat paws
    s.cone([0.025, 0.118, 0.042], [0.025, 0.058, 0.05], 0.015, 0.0105, { bone: 'shoulderL', k: 0.018, sym: true });
    s.cone([0.025, 0.058, 0.05], [0.025, 0.03, 0.051], 0.0098, 0.0092, { bone: 'elbowL', k: 0.008, sym: true, ...sock, paint: 0.4, tint: 0x5a3018 });
    s.cone([0.025, 0.036, 0.051], [0.025, 0.015, 0.051], 0.0094, 0.0092, { bone: 'elbowL', k: 0.008, sym: true, ...sock });
    s.ellipsoid([0.025, 0.0095, 0.058], [0.012, 0.0095, 0.016], { bone: 'pawL', k: 0.008, sym: true, ...sock });
    // hind legs: a fluffy thigh, slim hock, paw
    s.ellipsoid([0.029, 0.114, -0.042], [0.022, 0.036, 0.032], { bone: 'thighL', k: 0.035, sym: true });
    s.cone([0.028, 0.1, -0.05], [0.027, 0.054, -0.062], 0.015, 0.0098, { bone: 'thighL', k: 0.015, sym: true });
    s.cone([0.027, 0.054, -0.062], [0.027, 0.03, -0.054], 0.0094, 0.0092, { bone: 'kneeL', k: 0.008, sym: true, ...sock, paint: 0.4, tint: 0x5a3018 });
    s.cone([0.027, 0.034, -0.056], [0.027, 0.015, -0.05], 0.0092, 0.0092, { bone: 'kneeL', k: 0.008, sym: true, ...sock });
    s.ellipsoid([0.027, 0.0095, -0.043], [0.0115, 0.0095, 0.016], { bone: 'footL', k: 0.008, sym: true, ...sock });
    // the tail: huge and bushy, with a white tip
    s.chain(
      [[0, 0.134, -0.076], [0, 0.148, -0.126], [0, 0.146, -0.178], [0, 0.132, -0.223]],
      [0.014, 0.028, 0.034, 0.032],
      { bones: ['tail0', 'tail1', 'tail2'], k: 0.03, fur: 2.4 },
    );
    s.cone([0, 0.132, -0.223], [0, 0.116, -0.26], 0.032, 0.024, { bone: 'tail3', k: 0.03, fur: 2.6, tint: CREAM, paint: 0.1 });
    s.cone([0, 0.116, -0.26], [0, 0.11, -0.283], 0.024, 0.008, { bone: 'tail4', k: 0.02, fur: 2.8, tint: CREAM, paint: 0.05 });
  }

  parts(s) {
    const I = s.index;
    this.addEyes(s, {
      c: EYE,
      r: hr(0.02),
      dir: [0.38, 0.1, 0.92],
      iris: 0xd9902a,
      iris2: 0x7a4012,
      irisSize: 0.95,
      pupil: 0.46,
      lid: { tint: COAT, paint: 1, fur: 1, rough: 0.8, open: -0.6, closed: 1.6 },
    });
    // whiskers
    const wmat = this.mat('solid', { clearcoat: 0.3 });
    const whiskers = [];
    for (const side of [1, -1])
      for (let i = 0; i < 3; i++) {
        const y = NOSE[1] - 0.004 - i * 0.004;
        const z = NOSE[2] - 0.018 - i * 0.004;
        const a = [0.011 * side, y, z];
        const b = [0.04 * side, y + 0.004 - i * 0.004, z - 0.004];
        const c = [0.062 * side, y + 0.002 - i * 0.009, z - 0.012];
        const g = tubeGeometry([a, b, c], [0.0006, 0.0004, 0.00015], { radial: 4, steps: 8 });
        withLook(g, { tint: 0xf4efe8, rough: 0.4 });
        whiskers.push(g);
      }
    const wm = this.addMesh(bindTo(mergeGeometries(whiskers), I.head), wmat, { shadow: false });
    wm.userData.noProject = true;
    // inside of the mouth and a tongue, seen when he yips
    const inside = new THREE.SphereGeometry(0.012, 14, 10);
    inside.scale(1, 0.5, 1.4).translate(0, NOSE[1] - 0.012, NOSE[2] - 0.026);
    withLook(inside, { tint: MOUTH, rough: 0.5 });
    this.addMesh(bindTo(inside, I.head), this.mat('solid'), { shadow: false }).userData.noProject = true;
    const tongue = new THREE.SphereGeometry(0.008, 14, 8);
    tongue.scale(1, 0.35, 1.5).translate(0, NOSE[1] - 0.016, NOSE[2] - 0.024);
    withLook(tongue, { tint: TONGUE, rough: 0.35 });
    this.addMesh(bindTo(tongue, I.jaw), this.mat('solid', { clearcoat: 0.6 }), { shadow: false }).userData.noProject = true;
  }

  // ------------------------------------------------------------ motion

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
    const freq = lerp(1.8, 2.6, clamp(speed / 0.3, 0, 1)) * 0.8; // (a slower cadence with longer strides steps more smoothly)
    this.phase += dt * freq;
    const ph = this.phase;
    const duty = 0.5;
    const breathe = Math.sin(t * 2.3);
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
    this.tailUp = 0;
    this.tailWag = 0;

    // body: breathing, a springy trot bounce, a small shift of weight
    B.chest.scale.set(1 + breathe * 0.012, 1 + breathe * 0.016, 1 + breathe * 0.01);
    const bounce = Math.cos(ph * TAU * 2);
    const bob = (-0.003 + 0.003 * bounce) * moving - 0.0012;
    B.root.position.y += bob;
    B.root.position.x += Math.sin(t * 0.5) * 0.0018 * (1 - moving);
    B.root.rotation.z = Math.sin(ph * TAU) * 0.03 * moving + Math.sin(t * 0.5) * 0.015 * (1 - moving);
    B.root.rotation.x = Math.sin(ph * TAU * 2 + 0.7) * 0.02 * moving;
    B.hips.rotation.y = Math.sin(ph * TAU) * 0.06 * moving;
    B.chest.rotation.y = -Math.sin(ph * TAU) * 0.04 * moving;

    // head: curious, following what he looks at, a tilt now and then
    let yaw = Math.sin(t * 0.41) * 0.3 + Math.sin(t * 0.17) * 0.25;
    let pitch = Math.sin(t * 0.31) * 0.1;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z - 0.08), -0.8, 0.8);
      pitch = clamp(-Math.atan2(this.lookLocal.y - 0.21, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.45, 0.4);
    }
    const hy = this.headYaw.update(yaw * (1 - moving * 0.6), dt);
    const hp = this.headPitch.update(pitch, dt);
    const tilt = Math.sin(t * 0.37) * 0.16 * (1 - moving) + (this.lookLocal ? Math.sin(t * 0.9) * 0.08 : 0);
    pose(B.neck, -0.05 * moving + hp * 0.35 + breathe * 0.01, hy * 0.45, 0);
    pose(B.head, 0.04 * moving + hp * 0.65 + Math.sin(ph * TAU * 2) * 0.03 * moving, hy * 0.55, tilt);
    pose(B.jaw, 0.015 + Math.max(0, Math.sin(t * 0.8)) * 0.015, 0, 0);

    // a sniff at the ground now and then, only while standing about: it
    // fades out quickly if a trick or a walk starts in the middle of it
    const idle = moving < 0.05 && air < 0.05 && !this.trick;
    this.idleFade = clamp(this.idleFade + (idle ? dt : -dt) * 6, 0, 1);
    if (idle) {
      this.sniffTimer -= dt;
      if (this.sniffTimer <= 0 && this.sniffT < 0) this.sniffT = 0;
    }
    if (this.sniffT >= 0) {
      this.sniffT += dt;
      const k = bump(this.sniffT, 0, 2.0) * this.idleFade;
      addPose(B.neck, 0.45 * k, 0, 0);
      addPose(B.head, 0.35 * k + Math.sin(this.sniffT * 38) * 0.02 * k, Math.sin(this.sniffT * 2.5) * 0.2 * k, 0);
      if (this.sniffT > 2 || this.idleFade <= 0) {
        this.sniffT = -1;
        this.sniffTimer = rand(6, 12);
      }
    }

    // ears: big and expressive, perk to what he looks at, flick
    this.earTimer -= dt;
    if (this.earTimer <= 0) {
      this.earTimer = rand(1.2, 4);
      if (Math.random() < 0.5) this.earL.kick(rand(4, 9));
      else this.earR.kick(rand(4, 9));
    }
    const perk = this.lookLocal ? 0.1 : -0.05;
    const eL = this.earL.update(-hy * 0.3, dt);
    const eR = this.earR.update(hy * 0.3, dt);
    const earBounce = Math.sin(ph * TAU * 2 - 1) * 0.08 * moving;
    pose(B.earL, perk + eL * 0.2 + earBounce, eL * 0.3, -0.05 - eL * 0.12 - earBounce * 0.5);
    pose(B.earR, perk + eR * 0.2 + earBounce, -eR * 0.3, 0.05 + eR * 0.12 + earBounce * 0.5);

    // gait: a light, springy trot, diagonal pairs
    for (let i = 0; i < 4; i++) {
      gait.step(i, ph + TROT[i], duty, freq, 0.022 * moving, 0.016, _step);
      L[i].dz = _step[0];
      L[i].lift = _step[1];
      L[i].toe += (i < 2 ? 0.9 : 0.5) * (_step[1] / 0.022);
    }

    // in the air: front paws reach, hind legs stretch back, tail streams
    if (air > 0) {
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        L[i].off.set(0, front ? 0.022 * air : 0.012 * air, front ? 0.022 * air : -0.03 * air);
        L[i].toe += (front ? 0.6 : 0.8) * air;
      }
      addPose(B.neck, -0.2 * air, 0, 0);
      addPose(B.head, 0.1 * air, 0, 0);
      addPose(B.jaw, 0.25 * air, 0, 0);
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

    // the tail: held out behind, swaying, lagging, swishing now and then
    const fwd = clamp(tr.vel.z, -1, 1);
    const side = clamp(-tr.acc.x * 0.05 + tr.yawRate * 0.22, -0.7, 0.7);
    const bobV = (bob - this.prevBob) / Math.max(dt, 1e-3);
    this.prevBob = bob;
    this.swishTimer -= dt;
    if (this.swishTimer <= 0) {
      this.swishTimer = rand(2, 5);
      this.swish.kick(rand(-4, 4));
    }
    const sw = this.swish.update(0, dt);
    let prev = side + sw * 0.35 - hy * 0.25 + Math.sin(t * 0.9) * 0.08 + Math.sin(ph * TAU) * 0.15 * moving + this.tailWag;
    let prevL = fwd * 0.6 + clamp(-bobV * 2, -0.3, 0.3) + this.tailUp;
    for (let i = 0; i < 5; i++) {
      const a = this.tailSway[i].update(prev, dt);
      const b = this.tailLift[i].update(prevL * (i === 0 ? 1 : 0.4), dt);
      pose(B[TAIL[i]], -b * (i === 0 ? 0.5 : 0.25) + Math.sin(t * 1.3 - i * 0.6) * 0.02, a * (0.22 + i * 0.03), 0);
      prev = a;
      prevL = b;
    }
  }

  // pitch the whole body by ang about the ground at z = pz
  pivotPitch(ang, pz) {
    const root = this.bones.root;
    const dy = 0.116; // the root's rest height
    const dz = -pz;
    root.position.y += dy * Math.cos(ang) - dz * Math.sin(ang) - dy;
    root.position.z += dy * Math.sin(ang) + dz * Math.cos(ang) - dz;
    root.rotation.x += ang;
  }

  trickPose(tr, dt, L) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'pounce') {
      // crouch and wiggle, leap high, dive nose-first, pop up and shake.
      // Every curve runs on from the one before it: the body pitches over
      // into the dive during the leap and holds it on landing, and the paws
      // reach down and take the weight over the last moments of the fall.
      const crouch = ramp(t, 0.0, 0.35) * (1 - ramp(t, 0.62, 0.72));
      const wig = bump(t, 0.3, 0.68);
      const k = clamp((t - T_OFF) / (T_LAND - T_OFF), 0, 1); // the leap, 0..1
      const inK = smooth(k / 0.15); // eases the leap's pose in at take-off
      const hold = 1 - ramp(t, 1.5, 1.85); // nose in the grass until then
      const back = ramp(t, 1.4, 2.1); // steps back to where he started
      const down = ramp(t, T_LAND, 1.4); // pushes the nose into the grass
      const airW = ramp(t, 0.6, 0.72) * (1 - ramp(t, 1.2, 1.34)); // legs off the ground
      const land = wobble(t - T_LAND, 2.2, 0.55);
      const shake = bump(t, 1.85, 2.3);
      // the paws come off the ground as the leap starts (never a cut at
      // take-off: all of this is zero until airW is up)
      const fwd0 = Math.sin(k * Math.PI * 0.5) * 0.07 * (1 - back);
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        const l = L[i];
        l.plant = Math.min(l.plant, 1 - airW);
        l.off.set(0, (front ? 0.014 : 0.018) * airW, (front ? 0.07 * (1 - k) + 0.015 : -0.065) * airW);
        l.toe += (front ? 0.2 + 0.6 * k : 1.1) * airW;
        l.dz += fwd0; // planted paws come down where the body has got to
        l.lift += Math.max(0, Math.sin((t - 1.4) * TAU * 2.5 + i * 1.6)) * 0.012 * bump(t, 1.4, 2.1);
      }
      // crouch: chest low, bottom up
      B.root.position.y += -0.018 * crouch;
      addPose(B.root, 0.16 * crouch, 0, 0);
      B.hips.rotation.y += Math.sin(t * 34) * 0.14 * wig;
      B.hips.rotation.z += Math.sin(t * 34) * 0.05 * wig;
      addPose(B.neck, 0.25 * crouch, 0, 0);
      addPose(B.head, -0.25 * crouch, 0, 0);
      for (let i = 0; i < 4; i++) L[i].dz += (i < 2 ? 0.012 : -0.004) * crouch;
      if (t > T_OFF) {
        // a high arc forward; nose up at take-off, over to nose-down for the dive
        const fwd = Math.sin(k * Math.PI * 0.5) * 0.07 * (1 - back);
        B.root.position.y += Math.sin(k * Math.PI) * 0.13 - 0.02 * down * hold - Math.abs(land) * 0.006;
        B.root.position.z += fwd;
        const pitch = k < 0.2 ? -0.45 * smooth(k / 0.2) : lerp(-0.45, 0.55, smooth((k - 0.2) / 0.8));
        addPose(B.root, pitch * hold, 0, 0);
        addPose(B.neck, (lerp(-0.2, 0.2, k) * inK + 0.15 * down) * hold, 0, 0);
        addPose(B.head, 0.3 * down * hold + Math.sin(t * 26) * 0.18 * shake, 0, Math.sin(t * 26) * 0.25 * shake);
        this.tailUp = t < T_LAND ? lerp(0.8, -0.6, k) * inK : lerp(-0.6, 0.9, ramp(t, T_LAND, 1.45)) * hold;
        this.tailWag = Math.sin(t * 20) * 0.5 * bump(t, 1.3, 2.2);
      }
      if (!tr.s1 && t > 0.62) {
        tr.s1 = true;
        this.emit('sound', { name: 'pounce' });
      }
      if (!tr.landed && t > T_LAND) {
        tr.landed = true;
        const at = this.bonePoint('head', [0, -0.03, 0.08]);
        this.emit('sparkle', { at, count: 36, colors: [[1.9, 1.8, 1.4], [1.8, 1.3, 0.6]], speed: 0.7, up: 0.8, size: 0.018 });
        this.emit('land', { at: this.bonePoint('chest', [0, -0.1, 0.03]) });
      }
      if (!tr.s2 && t > 1.9) {
        tr.s2 = true;
        this.emit('sound', { name: 'happy' });
      }
      addPose(B.jaw, 0.3 * bump(t, 1.9, 2.4), 0, 0);
    } else if (tr.name === 'chase') {
      // looks round at his tail, then chases it round and round, then wobbles
      const look = ramp(t, 0.0, 0.35) * (1 - ramp(t, 2.1, 2.45));
      const run = ramp(t, 0.2, 0.42) * (1 - ramp(t, 2.0, 2.2));
      const spin = smooth((t - 0.38) / 1.72);
      B.root.rotation.y += spin * TAU * 2;
      B.chest.rotation.y += 0.3 * look;
      B.hips.rotation.y += -0.4 * look;
      addPose(B.neck, 0.1 * look, 0.55 * look, 0);
      addPose(B.head, 0, 0.45 * look, 0.2 * look);
      this.tailWag = 1.1 * look + Math.sin(t * 14) * 0.2 * run;
      B.root.rotation.z += -0.12 * run;
      B.root.position.y += Math.abs(Math.sin(t * 16)) * 0.006 * run;
      // quick little steps as he spins: the paws come off their planted
      // places (which don't turn with him) and patter under the body
      for (let i = 0; i < 4; i++) {
        const p = t * 3.2 + (i === 0 || i === 3 ? 0 : 0.5);
        stepOffset(p, 0.5, 0.0, 0.016 * run, 0.45, _step);
        L[i].plant = Math.min(L[i].plant, 1 - run);
        L[i].off.y += _step[1];
        L[i].toe += 0.5 * (_step[1] / 0.016);
      }
      const dizzy = bump(t, 2.05, 2.8);
      B.root.rotation.z += Math.sin(t * 9) * 0.07 * dizzy;
      addPose(B.head, 0, Math.sin(t * 5) * 0.2 * dizzy, Math.sin(t * 7) * 0.2 * dizzy);
      addPose(B.jaw, 0.25 * run, 0, 0);
      if (!tr.s1 && t > 0.3) {
        tr.s1 = true;
        this.emit('sound', { name: 'chase' });
      }
      tr.next ??= 0.6;
      if (t > tr.next && t < 2.0) {
        tr.next += 0.22;
        this.emit('sparkle', { at: this.bonePoint('tail4', [0, 0, -0.02]), count: 6, colors: [[1.9, 1.4, 0.7], [1.7, 1.7, 1.5]], speed: 0.3, up: 0.3, size: 0.015, life: 1 });
      }
      if (!tr.s2 && t > 2.15) {
        tr.s2 = true;
        this.emit('sound', { name: 'happy' });
      }
    } else if (tr.name === 'wag') {
      // sits, sweeps his big tail from side to side, head tilted, happy
      const sit = ramp(t, 0.05, 0.5) * (1 - ramp(t, 2.35, 2.75));
      this.pivotPitch(-0.5 * sit, 0.052);
      B.root.position.y += -0.004 * sit;
      addPose(B.neck, 0.2 * sit, 0, 0);
      addPose(B.head, 0.25 * sit, 0, Math.sin(t * 2.2) * 0.25 * sit);
      for (let i = 2; i < 4; i++) {
        L[i].dz += 0.03 * sit;
        L[i].toe += 0.2 * sit;
      }
      const wag = Math.sin(t * 13) * bump(t, 0.4, 2.45);
      this.tailWag = wag * 1.4;
      this.tailUp = -0.9 * sit;
      addPose(B.jaw, 0.22 * bump(t, 0.5, 2.3), 0, 0);
      B.root.rotation.z += wag * 0.03;
      if (!tr.s1 && t > 0.45) {
        tr.s1 = true;
        this.emit('sound', { name: 'wag' });
      }
      if (!tr.sp && t > 1.2) {
        tr.sp = true;
        this.emit('sparkle', { at: this.bonePoint('tail3', [0, 0.02, 0]), count: 24, colors: [[1.9, 1.5, 0.8], [1.6, 1.2, 1.9]], speed: 0.5, up: 0.5, size: 0.016 });
      }
    }
  }

  trickLength(name) {
    return { pounce: 2.5, chase: 2.8, wag: 2.8 }[name] || 2;
  }
}

// ------------------------------------------------------------ sounds

// a fox cub's yip: a short bright chirp that jumps up and falls
function yip(a, t, { v = 0.08, f = 1, dur = 0.14 } = {}) {
  glide(a, t, [[0, 780 * f], [dur * 0.3, 1500 * f], [dur, 1050 * f]], { v, formant: 1900, q: 1.6, type: 'sawtooth', breath: 0.25, attack: 0.008 });
}

export const calls = {
  happy(a, t) {
    yip(a, t, { v: 0.08, f: 1.05 });
    yip(a, t + 0.17, { v: 0.07, f: 1.2, dur: 0.12 });
  },
  pounce(a, t) {
    puff(a, t, { v: 0.06, from: 500, to: 1600, dur: 0.5 });
    yip(a, t + 0.05, { v: 0.07, f: 1.3, dur: 0.18 });
    puff(a, t + 0.6, { v: 0.08, from: 1800, to: 900, dur: 0.35 });
    for (let i = 0; i < 5; i++) a.bell(rand(1800, 3200), 0.025, t + 0.62 + i * 0.05, 0.5);
  },
  chase(a, t) {
    // excited chattering yips while he spins
    for (let i = 0; i < 5; i++) yip(a, t + 0.1 + i * 0.3, { v: 0.06, f: 1 + i * 0.06, dur: 0.1 });
    puff(a, t, { v: 0.04, from: 400, to: 1200, dur: 1.6 });
  },
  wag(a, t) {
    // soft thumps of the tail and a happy whine
    for (let i = 0; i < 6; i++) puff(a, t + 0.1 + i * 0.24, { v: 0.06, from: 220, to: 420, dur: 0.12 });
    glide(a, t + 0.2, [[0, 900], [0.25, 1350], [0.6, 1100], [0.9, 1250]], { v: 0.05, formant: 1700, q: 1.4, vibrato: 18, breath: 0.3 });
  },
};
