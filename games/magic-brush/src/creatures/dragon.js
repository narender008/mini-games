// Draco, a baby dragon: a big round head with huge purple eyes, little
// ridged horns and fin-like frills, a soft round body with a cream belly,
// stubby legs with tiny claws, small wings that light shines through and a
// tail with a leaf-shaped tip. Iridescent scales carry the child's colours.
//
// Tricks: 'puff' (breathes in, then puffs a cloud of sparkles), 'flap'
// (hops up, hovers flapping and spins round) and 'wiggle' (a happy dance).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, fanGeometry, withLook, bindTo, bindBy } from './parts.js';
import { pose, addPose, bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp } from './anim.js';

const HORN = 0xead3a0;
const CLAW = 0xf3ead8;
const BELLY = 0xf3e2bf;
const MOUTH = 0x5a1320;
const TONGUE = 0xe2687c;

export class Dragon extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { scales: true, iridescence: 0.95, clearcoat: 0.3 };
    this.shared.uScale.value = 0.0042;
    this.shared.uSplat.value = 0.25;
    this.phase = 0;
    this.headYaw = new Spring(0, 1.6, 0.8);
    this.headPitch = new Spring(0, 1.6, 0.8);
    this.flap = 0;
    this.tailSway = new Spring(0, 1.2, 0.35);
  }

  get tricks() {
    return ['puff', 'flap', 'wiggle'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0.12, 0]);
    s.bone('hips', 'root', [0, 0.12, -0.045]);
    s.bone('chest', 'root', [0, 0.135, 0.04]);
    s.bone('neck', 'chest', [0, 0.18, 0.08]);
    s.bone('head', 'neck', [0, 0.25, 0.115]);
    s.bone('jaw', 'head', [0, 0.235, 0.15]);
    this.eyeBones(s, [0.046, 0.284, 0.176]);
    s.bones2('ear', 'head', [0.066, 0.29, 0.11]);
    s.bone('tail0', 'hips', [0, 0.125, -0.11]);
    s.bone('tail1', 'tail0', [0, 0.105, -0.17]);
    s.bone('tail2', 'tail1', [0, 0.083, -0.23]);
    s.bone('tail3', 'tail2', [0, 0.066, -0.28]);
    s.bone('tail4', 'tail3', [0, 0.058, -0.325]);
    s.bones2('shoulder', 'chest', [0.052, 0.12, 0.068]);
    s.bones2('elbow', 'shoulder', [0.058, 0.07, 0.082]);
    s.bones2('paw', 'elbow', [0.06, 0.028, 0.094]);
    s.bones2('thigh', 'hips', [0.058, 0.11, -0.05]);
    s.bones2('knee', 'thigh', [0.064, 0.072, -0.042]);
    s.bones2('foot', 'knee', [0.064, 0.028, -0.034]);
    s.bones2('wing', 'chest', [0.042, 0.19, 0.025]);
    s.bones2('wingTip', 'wing', [0.095, 0.255, -0.03]);

    const scaly = { paint: 1, rough: 0.42, pat: 1, tint: 0x38b3a8 };
    const belly = { paint: 0.22, rough: 0.55, pat: 0, tint: BELLY };
    s.setLook(scaly);
    // body
    s.ellipsoid([0, 0.137, 0.035], [0.074, 0.08, 0.08], { bone: 'chest', k: 0.03 });
    s.ellipsoid([0, 0.122, -0.05], [0.078, 0.076, 0.086], { bone: 'hips', k: 0.06 });
    s.ellipsoid([0, 0.1, 0.028], [0.064, 0.066, 0.082], { bone: 'root', k: 0.035, ...belly });
    // neck and head
    s.cone([0, 0.16, 0.07], [0, 0.225, 0.105], 0.052, 0.046, { bone: 'neck', k: 0.035 });
    s.ellipsoid([0, 0.272, 0.125], [0.08, 0.073, 0.078], { bone: 'head', k: 0.035 });
    s.ellipsoid([0, 0.25, 0.188], [0.056, 0.043, 0.056], { bone: 'head', k: 0.035 });
    s.sphere([0, 0.262, 0.232], 0.022, { bone: 'head', k: 0.025 });
    s.sphere([0.045, 0.246, 0.163], 0.032, { bone: 'head', k: 0.03, sym: true });
    s.ellipsoid([0.034, 0.307, 0.168], [0.03, 0.013, 0.024], { bone: 'head', k: 0.02, sym: true });
    // chin and lower jaw, cream like the belly
    s.ellipsoid([0, 0.226, 0.172], [0.046, 0.021, 0.05], { bone: 'jaw', k: 0.022, ...belly, paint: 0.3 });
    // a little crest of soft spikes on the head and down the back
    const spike = (a, b, r, bone) => s.cone(a, b, r, 0.0025, { bone, k: 0.008, tint: 0x7b5ad0, paint: 0.85, pat: 0.4, rough: 0.35 });
    spike([0, 0.335, 0.13], [0, 0.358, 0.112], 0.011, 'head');
    spike([0, 0.33, 0.1], [0, 0.35, 0.078], 0.01, 'head');
    spike([0, 0.312, 0.07], [0, 0.328, 0.05], 0.009, 'head');
    spike([0, 0.212, 0.04], [0, 0.238, 0.018], 0.012, 'chest');
    spike([0, 0.206, -0.01], [0, 0.232, -0.036], 0.012, 'hips');
    spike([0, 0.196, -0.06], [0, 0.22, -0.086], 0.011, 'hips');
    spike([0, 0.167, -0.115], [0, 0.188, -0.14], 0.01, 'tail0');
    spike([0, 0.14, -0.172], [0, 0.158, -0.195], 0.008, 'tail1');
    spike([0, 0.113, -0.23], [0, 0.128, -0.25], 0.006, 'tail2');
    // tail, curving down and out, with a leaf-shaped tip
    s.chain(
      [[0, 0.13, -0.1], [0, 0.112, -0.165], [0, 0.088, -0.228], [0, 0.07, -0.28], [0, 0.06, -0.325], [0, 0.062, -0.36]],
      [0.05, 0.04, 0.03, 0.021, 0.013, 0.007],
      { bones: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'], k: 0.02 },
    );
    s.ellipsoid([0, 0.066, -0.378], [0.006, 0.024, 0.03], { bone: 'tail4', k: 0.012, tint: 0x7b5ad0, paint: 0.85, pat: 0.3 });
    // front legs
    s.ellipsoid([0.05, 0.122, 0.064], [0.03, 0.04, 0.034], { bone: 'shoulderL', k: 0.03, sym: true });
    s.cone([0.055, 0.11, 0.07], [0.06, 0.066, 0.083], 0.027, 0.022, { bone: 'shoulderL', k: 0.02, sym: true });
    s.cone([0.06, 0.066, 0.083], [0.061, 0.03, 0.094], 0.022, 0.021, { bone: 'elbowL', k: 0.015, sym: true });
    s.ellipsoid([0.061, 0.02, 0.104], [0.026, 0.018, 0.03], { bone: 'pawL', k: 0.018, sym: true });
    // hind legs
    s.ellipsoid([0.057, 0.103, -0.05], [0.036, 0.047, 0.05], { bone: 'thighL', k: 0.035, sym: true });
    s.cone([0.063, 0.078, -0.045], [0.065, 0.032, -0.036], 0.028, 0.022, { bone: 'kneeL', k: 0.02, sym: true });
    s.ellipsoid([0.065, 0.02, -0.015], [0.028, 0.019, 0.038], { bone: 'footL', k: 0.02, sym: true });
    // toes, a little paler
    for (const [x, z, bone] of [[0.045, 0.126, 'pawL'], [0.061, 0.13, 'pawL'], [0.077, 0.124, 'pawL'], [0.049, 0.018, 'footL'], [0.065, 0.022, 'footL'], [0.081, 0.017, 'footL']])
      s.sphere([x, 0.013, z], 0.0115, { bone, k: 0.008, sym: true });
    // the mouth: a smiling line carved across the muzzle, nostrils
    s.torus([0, 0.262, 0.17], 0.052, 0.0032, { sub: true, k: 0.004, rot: [0.28, 0, 0], tint: MOUTH, paint: 0, pat: 0, rough: 0.5 });
    s.sphere([0.013, 0.272, 0.252], 0.0032, { sub: true, k: 0.003, sym: true, tint: 0x1d3a3a, paint: 0.5, pat: 0 });
  }

  parts(s) {
    const I = s.index;
    this.addEyes(s, {
      c: [0.046, 0.284, 0.176],
      r: 0.034,
      dir: [0.4, 0.12, 1],
      iris: 0x8a55e0,
      iris2: 0x2a9fc0,
      irisSize: 0.9,
      pupil: 0.4,
      lid: { tint: 0x38b3a8, paint: 1, pat: 1, open: -0.5, closed: 1.45 },
    });
    // horns: ridged, curling back
    const hornMat = this.mat('solid', { clearcoat: 0.5 });
    for (const side of [1, -1]) {
      const g = tubeGeometry(
        [[0.04 * side, 0.315, 0.095], [0.052 * side, 0.34, 0.075], [0.058 * side, 0.352, 0.045], [0.055 * side, 0.348, 0.02], [0.05 * side, 0.335, 0.008]],
        [0.012, 0.0095, 0.007, 0.0045, 0.0022],
        { radial: 14, steps: 30, ridges: 6, ridgeDepth: 0.14 },
      );
      withLook(g, { tint: HORN, rough: 0.35 });
      // darker at the base
      const p = g.attributes.position;
      const t = g.attributes.aTint;
      for (let i = 0; i < p.count; i++) {
        const k = clamp((p.getY(i) - 0.315) / 0.035, 0, 1);
        t.setXYZ(i, lerp(0.45, 0.83, k), lerp(0.3, 0.66, k), lerp(0.18, 0.36, k));
      }
      this.addMesh(bindTo(g, I.head), hornMat);
    }
    // claws
    const clawMat = this.mat('solid', { clearcoat: 0.6 });
    for (const [x, z, bone, dz] of [[0.045, 0.134, 'paw', 1], [0.061, 0.139, 'paw', 1], [0.077, 0.132, 'paw', 1], [0.049, 0.027, 'foot', 1], [0.065, 0.031, 'foot', 1], [0.081, 0.026, 'foot', 1]])
      for (const side of [1, -1]) {
        const g = tubeGeometry([[x * side, 0.014, z - 0.004], [x * side, 0.011, z + 0.004 * dz], [x * side, 0.004, z + 0.008 * dz]], [0.0045, 0.003, 0.0012], { radial: 8, steps: 6 });
        withLook(g, { tint: CLAW, rough: 0.3 });
        this.addMesh(bindTo(g, I[bone + (side > 0 ? 'L' : 'R')]), clawMat, { shadow: false });
      }
    // mouth inside and tongue, seen when the jaw opens
    const inside = new THREE.SphereGeometry(0.03, 16, 12);
    inside.scale(1.1, 0.55, 1.2).translate(0, 0.24, 0.185);
    withLook(inside, { tint: MOUTH, rough: 0.5 });
    this.addMesh(bindTo(inside, I.head), this.mat('solid'), { shadow: false }).userData.noProject = true;
    const tongue = new THREE.SphereGeometry(0.02, 16, 10);
    tongue.scale(1.05, 0.38, 1.4).translate(0, 0.232, 0.19);
    withLook(tongue, { tint: TONGUE, rough: 0.35 });
    this.addMesh(bindTo(tongue, I.jaw), this.mat('solid', { clearcoat: 0.6 }), { shadow: false }).userData.noProject = true;

    // frills: fins on the sides of the head
    const memb = this.mat('membrane', { iridescence: 0.8 });
    const spineMat = this.mat('solid', { clearcoat: 0.3 });
    for (const side of [1, -1]) {
      const root = [0.066 * side, 0.29, 0.11];
      const tips = [[0.105 * side, 0.338, 0.085], [0.128 * side, 0.305, 0.06], [0.122 * side, 0.265, 0.062], [0.098 * side, 0.245, 0.082]];
      const g = fanGeometry(root, tips, { sag: 0.22, cup: 0.006, normal: [side, 0, 0.3], radial: 6, arc: 6 });
      withLook(g, { tint: 0x8a5ce0, paint: 0.6, rough: 0.35 });
      this.addMesh(bindTo(g, I['ear' + (side > 0 ? 'L' : 'R')]), memb, { shadow: true });
      for (const tp of tips) {
        const sp = tubeGeometry([root, [(root[0] + tp[0]) / 2, (root[1] + tp[1]) / 2 + 0.004, (root[2] + tp[2]) / 2], tp], [0.004, 0.003, 0.0015], { radial: 6, steps: 8 });
        withLook(sp, { tint: 0x5b3fae, paint: 0.5, rough: 0.35 });
        this.addMesh(bindTo(sp, I['ear' + (side > 0 ? 'L' : 'R')]), spineMat, { shadow: false });
      }
    }

    // wings: a membrane on three fingers, raised up and back
    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      const root = [0.045 * side, 0.195, 0.03];
      const elbow = [0.085 * side, 0.265, 0.0];
      const tips = [[0.098 * side, 0.315, -0.015], [0.14 * side, 0.29, -0.07], [0.132 * side, 0.235, -0.1], [0.095 * side, 0.2, -0.085], [0.058 * side, 0.19, -0.04]];
      const g = fanGeometry(root, tips, { sag: 0.2, cup: 0.01, normal: [side, 0.2, 0], radial: 10, arc: 7 });
      withLook(g, { tint: 0x9d7be8, paint: 1, rough: 0.4 });
      const span = g.attributes.aSpan;
      bindBy(g, (x, y, z, i) => {
        const k = smooth((span.getX(i) - 0.25) / 0.5);
        return [[I['wing' + S], 1 - k], [I['wingTip' + S], k]];
      });
      this.addMesh(g, memb, { shadow: true });
      // the wing's arm and finger bones
      const arm = tubeGeometry([root, elbow, tips[0]], [0.0075, 0.006, 0.003], { radial: 8, steps: 12 });
      withLook(arm, { tint: 0x38b3a8, paint: 1, rough: 0.4, pat: 0.5 });
      bindBy(arm, (x, y) => {
        const k = smooth((y - 0.22) / 0.06);
        return [[I['wing' + S], 1 - k], [I['wingTip' + S], k]];
      });
      this.addMesh(arm, spineMat, { shadow: false });
      for (const tp of tips.slice(1, 4)) {
        const f = tubeGeometry([elbow, [(elbow[0] + tp[0]) / 2, (elbow[1] + tp[1]) / 2 + 0.005, (elbow[2] + tp[2]) / 2], tp], [0.005, 0.0035, 0.0015], { radial: 6, steps: 10 });
        withLook(f, { tint: 0x5b3fae, paint: 0.6, rough: 0.4 });
        bindTo(f, I['wingTip' + S]);
        this.addMesh(f, spineMat, { shadow: false });
      }
    }
  }

  // ------------------------------------------------------------ motion

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    const speed = m.speed;
    const moving = clamp(speed / 0.25, 0, 1) * (1 - m.air);
    // gait: a waddling trot, feet in diagonal pairs
    this.phase += dt * (speed / 0.13) * TAU * 0.5 + dt * 0.0;
    const ph = this.phase;
    const breathe = Math.sin(t * 2.1);

    // body: breathing, a bob and a sway when walking
    B.chest.scale.set(1 + breathe * 0.012, 1 + breathe * 0.018, 1 + breathe * 0.012);
    B.root.position.y += Math.abs(Math.sin(ph)) * 0.008 * moving - 0.002 * moving;
    B.root.rotation.z = Math.sin(ph) * 0.06 * moving;
    B.root.rotation.x = -0.04 * moving;

    // head: follows the look target softly, with a curious tilt
    let yaw = Math.sin(t * 0.37) * 0.25 + Math.sin(t * 0.13) * 0.2;
    let pitch = Math.sin(t * 0.29) * 0.08;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z), -0.7, 0.7);
      pitch = clamp(-Math.atan2(this.lookLocal.y - 0.27, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.35, 0.35);
    }
    const hy = this.headYaw.update(yaw * (1 - moving * 0.6), dt);
    const hp = this.headPitch.update(pitch, dt);
    pose(B.neck, hp * 0.4 + Math.sin(ph * 2) * 0.03 * moving, hy * 0.4, 0);
    pose(B.head, hp * 0.6 - Math.sin(ph * 2) * 0.04 * moving, hy * 0.6, Math.sin(t * 0.5) * 0.08);
    pose(B.jaw, 0.06 + Math.max(0, Math.sin(t * 0.7)) * 0.03, 0, 0);

    // frills flutter now and then
    const tw = Math.pow(Math.max(0, Math.sin(t * 0.9)), 12);
    pose(B.earL, 0, 0, -0.1 * tw + Math.sin(t * 3) * 0.03);
    pose(B.earR, 0, 0, 0.1 * tw - Math.sin(t * 3) * 0.03);

    // legs
    const legs = [
      ['shoulderL', 'elbowL', 'pawL', 0],
      ['shoulderR', 'elbowR', 'pawR', Math.PI],
      ['thighL', 'kneeL', 'footL', Math.PI],
      ['thighR', 'kneeR', 'footR', 0],
    ];
    for (const [a, b, c, off] of legs) {
      const p = ph + off;
      const swing = Math.sin(p) * 0.45 * moving;
      const lift = Math.max(0, Math.cos(p)) * moving;
      const front = a.startsWith('shoulder');
      pose(B[a], -swing, 0, 0);
      pose(B[b], front ? -lift * 0.4 : lift * 0.6, 0, 0);
      pose(B[c], swing * 0.5 + (front ? lift * 0.5 : -lift * 0.5), 0, 0);
    }
    // in the air: front paws reach forward, hind legs trail
    if (m.air > 0) {
      const a = m.air;
      addPose(B.shoulderL, -0.9 * a, 0, 0.1 * a);
      addPose(B.shoulderR, -0.9 * a, 0, -0.1 * a);
      addPose(B.elbowL, 0.3 * a, 0, 0);
      addPose(B.elbowR, 0.3 * a, 0, 0);
      addPose(B.thighL, 0.7 * a, 0, 0);
      addPose(B.thighR, 0.7 * a, 0, 0);
      addPose(B.jaw, 0.25 * a, 0, 0);
    }

    // tail: a lazy sway that lags along its length
    const sway = this.tailSway.update(-hy * 0.5 + Math.sin(t * 1.3) * 0.25 + Math.sin(ph) * 0.2 * moving, dt);
    for (let i = 0; i < 5; i++) {
      const lag = Math.sin(t * 1.3 - i * 0.55) * 0.12 * (0.4 + i * 0.25);
      pose(B['tail' + i], (i === 0 ? -0.1 : 0.06) - m.air * 0.12, sway * 0.25 + lag, 0);
    }

    // wings: folded with a small rustle, spread and flapping when flying
    const flyAmt = Math.max(m.fly, m.air * 0.7);
    this.flap += dt * lerp(1.2, 9, flyAmt);
    const beat = Math.sin(this.flap);
    const rustle = Math.pow(Math.max(0, Math.sin(t * 0.5 + 1)), 20) * Math.sin(t * 30) * 0.15;
    const spread = flyAmt;
    const wz = lerp(0.1 + rustle, 0.2 + beat * 0.85, spread);
    pose(B.wingL, 0, lerp(0, 0.3, spread), wz);
    pose(B.wingR, 0, -lerp(0, 0.3, spread), -wz);
    pose(B.wingTipL, 0, 0, lerp(0.05, 0.35 + beat * 0.4, spread));
    pose(B.wingTipR, 0, 0, -lerp(0.05, 0.35 + beat * 0.4, spread));

    if (this.trick) this.trickPose(this.trick, dt);
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'puff') {
      // breathe in (chest swells, head back), then puff sparkles forward
      const inhale = ramp(t, 0.1, 0.8) * (1 - ramp(t, 0.9, 1.05));
      const puff = bump(t, 0.85, 1.6);
      B.chest.scale.multiplyScalar(1 + inhale * 0.07);
      addPose(B.neck, -0.25 * inhale + 0.25 * puff, 0, 0);
      addPose(B.head, -0.2 * inhale + 0.2 * puff, 0, 0);
      addPose(B.jaw, 0.35 * puff, 0, 0);
      B.root.position.y += puff * 0.01;
      if (!tr.fired && t > 0.9) {
        tr.fired = true;
        this.emit('puff', { at: this.bonePoint('head', [0, -0.02, 0.13]), dir: this.bonePoint('head', [0, -0.01, 0.6]) });
        this.emit('sound', { name: 'puff' });
      }
      if (!tr.giggle && t > 1.7) {
        tr.giggle = true;
        this.emit('sound', { name: 'happy' });
      }
      const g = wobble(t - 1.6, 3, 0.6);
      B.root.position.y += Math.abs(g) * 0.01;
    } else if (tr.name === 'flap') {
      // crouch, hop up, hover flapping and turn a full circle, land
      const crouch = bump(t, 0, 0.45) * (t < 0.45 ? 1 : 0);
      const up = ramp(t, 0.35, 0.8) * (1 - ramp(t, 1.9, 2.3));
      const land = wobble(t - 2.3, 2.5, 0.6);
      B.root.position.y += -crouch * 0.02 + up * (0.2 + Math.sin(t * 7) * 0.012) + Math.abs(land) * -0.01;
      B.root.rotation.y += smooth((t - 0.8) / 1.1) * TAU;
      this.motion.fly = up;
      if (up > 0.2) {
        addPose(B.thighL, 0.4 * up, 0, 0);
        addPose(B.thighR, 0.4 * up, 0, 0);
        addPose(B.shoulderL, -0.3 * up, 0, 0);
        addPose(B.shoulderR, -0.3 * up, 0, 0);
      }
      if (!tr.fired && t > 0.35) {
        tr.fired = true;
        this.emit('sound', { name: 'flap' });
      }
      if (!tr.landed && t > 2.3) {
        tr.landed = true;
        this.motion.fly = 0;
        this.emit('land', { at: this.bonePoint('root') });
        this.emit('sound', { name: 'happy' });
      }
      if (t > 2.3) this.motion.fly = 0;
    } else if (tr.name === 'wiggle') {
      // a little dance: hops, a wiggle, a wag
      const hop = Math.max(0, Math.sin(t * Math.PI * 2.2)) * (1 - ramp(t, 2.0, 2.4));
      B.root.position.y += hop * 0.03;
      B.root.rotation.z += Math.sin(t * 9) * 0.12 * (1 - ramp(t, 2.0, 2.4));
      B.root.rotation.y += Math.sin(t * 4.5) * 0.25 * (1 - ramp(t, 2.0, 2.4));
      for (let i = 0; i < 5; i++) addPose(B['tail' + i], 0, Math.sin(t * 14 - i * 0.6) * 0.25, 0);
      addPose(B.jaw, 0.25 * bump(t, 0.1, 2.3), 0, 0);
      addPose(B.shoulderL, -0.5 * hop, 0, 0);
      addPose(B.shoulderR, -0.5 * hop, 0, 0);
      if (!tr.fired && t > 0.1) {
        tr.fired = true;
        this.emit('sound', { name: 'happy' });
      }
    }
  }

  trickLength(name) {
    return { puff: 2.3, flap: 2.9, wiggle: 2.5 }[name] || 2;
  }
}
