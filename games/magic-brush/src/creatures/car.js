// Zoom, a chunky toy car: a glossy lacquered body with a round bubble cabin,
// big friendly eyes on the windscreen, a smiling chrome grille, round
// headlights for cheeks, chrome bumpers, glass windows in chrome frames,
// wing mirrors that flap like ears, a whippy antenna and fat rubber tyres
// with a chunky tread on chrome hubs. The child's colours become its paint.
//
// It drives rather than walks: the wheels roll with its speed and the front
// ones steer into turns, while the body rides on springs, squatting as it
// pulls away, diving as it stops and leaning out of corners.
//
// Tricks: 'honk' (squats, then two happy honks that bounce it on its
// springs, headlights flashing), 'donut' (revs and spins a full donut round
// its front wheels in a spray of dusty sparkles) and 'wheelie' (revs, pops
// its nose up and balances on its back wheels, then drops with a bounce).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, bindBy, tintBy } from './parts.js';
import { fieldOf, hit, grad, squircle, panelGeometry, placeAlong, stripUv, mergeAll, mergeSkinned, latheX } from './shape-kit.js';
import { addPose, bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp, easeOutBack } from './anim.js';
import { glide, puff } from '../sound/calls.js';

const PAINT = 0xe53935;
const RUBBER = 0x1b1b1f;
const CHASSIS = 0x26262c;
const WELL = 0x18181c;
const MOUTH = 0x2a1418;
const CHROME = 0xe4e7ec;
const GLASS = 0x16202c;

// wheels: radius, axle height, half track, half wheelbase
const WR = 0.05;
const AXLE = 0.05;
const TRACK = 0.086;
const WB = 0.104;
// the bubble cabin (an ellipsoid)
const CAB_C = [0, 0.14, -0.02];
const CAB_R = [0.088, 0.08, 0.118];
// the eyes sit in the windscreen
const EYE_R = 0.029;
const EYE_C = (() => {
  const x = 0.036, y = 0.176;
  const k = 1 - (x / CAB_R[0]) ** 2 - ((y - CAB_C[1]) / CAB_R[1]) ** 2;
  return [x, y, CAB_C[2] + CAB_R[2] * Math.sqrt(k) - 0.011];
})();
const ANT = [0.036, 0.0, -0.088]; // antenna base (y found on the roof)

export class Car extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { clearcoat: 1 };
    this.shared.uSplat.value = 0.12;
    this.walkSpeed = 0.5;
    this.turnRate = 1.4;
    this.worldScale = 1;
    this.hopScale = 0.8;
    this.spin = 0;
    this.lastSpeed = 0;
    this.lastYaw = null;
    this.accel = 0;
    this.yawRate = 0;
    this.heave = new Spring(0, 2.6, 0.32);
    this.pitch = new Spring(0, 1.9, 0.42);
    this.roll = new Spring(0, 1.7, 0.45);
    this.steer = new Spring(0, 2.5, 0.8);
    this.headYaw = new Spring(0, 1.4, 0.75);
    this.headTilt = new Spring(0, 1.2, 0.6);
    this.mirror = new Spring(0, 3.2, 0.18);
    this.antX = new Spring(0, 2.6, 0.12);
    this.antZ = new Spring(0, 2.6, 0.12);
    this.lastPose = { pitch: 0, roll: 0, heave: 0 };
    this.bumpIn = 0.2;
    this.puffIn = 3;
    this.flash = 0;
    this.brake = 0;
  }

  get tricks() {
    return ['honk', 'donut', 'wheelie'];
  }

  sculpt(s) {
    s.bone('root', null, [0, AXLE, 0]);
    s.bone('body', 'root', [0, 0.078, 0]);
    s.bone('cabin', 'body', [0, 0.13, -0.02]);
    this.eyeBones(s, EYE_C, 'cabin');
    s.bones2('mirror', 'cabin', [0.074, 0.146, 0.068]);
    const antY = CAB_C[1] + CAB_R[1] * Math.sqrt(1 - (ANT[0] / CAB_R[0]) ** 2 - ((ANT[2] - CAB_C[2]) / CAB_R[2]) ** 2);
    this.antBase = [ANT[0], antY - 0.002, ANT[2]];
    s.bone('ant0', 'cabin', this.antBase);
    s.bone('ant1', 'ant0', [ANT[0], antY + 0.036, ANT[2] - 0.006]);
    s.bones2('steer', 'root', [TRACK, AXLE, WB]);
    s.bones2('wheelF', 'steer', [TRACK, AXLE, WB]);
    s.bones2('wheelB', 'root', [TRACK, AXLE, -WB]);

    const paint = { tint: PAINT, paint: 1, rough: 0.28, pat: 0, fur: 0 };
    s.setLook(paint);
    // the tub: a chunky rounded slab, with a gently domed bonnet and boot
    s.box([0, 0.088, 0.002], [0.1, 0.045, 0.168], 0.042, { bone: 'body', k: 0.02 });
    s.ellipsoid([0, 0.112, 0.098], [0.084, 0.03, 0.074], { bone: 'body', k: 0.03 });
    s.ellipsoid([0, 0.112, -0.11], [0.084, 0.028, 0.06], { bone: 'body', k: 0.03 });
    // round fender flares over the wheels
    for (const z of [WB, -WB]) s.ellipsoid([0.088, 0.078, z], [0.024, 0.058, 0.076], { bone: 'body', k: 0.026, sym: true });
    // dark chassis underneath
    s.box([0, 0.048, 0.0], [0.084, 0.012, 0.148], 0.01, { bone: 'body', k: 0.014, tint: CHASSIS, paint: 0.05, rough: 0.75 });
    // the bubble cabin
    s.ellipsoid(CAB_C, CAB_R, { bone: 'cabin', k: 0.03 });
    // wing mirrors on little stalks
    s.cone([0.072, 0.146, 0.068], [0.098, 0.152, 0.066], 0.0055, 0.0045, { bone: 'mirrorL', k: 0.008, sym: true });
    s.box([0.107, 0.155, 0.064], [0.012, 0.0095, 0.0075], 0.0068, { bone: 'mirrorL', k: 0.006, sym: true, rot: [0, -0.25, 0.12] });
    // wheel arches, dark inside
    for (const z of [WB, -WB]) s.ellipsoid([0.122, AXLE, z], [0.058, 0.061, 0.061], { bone: 'body', sub: true, k: 0.006, sym: true, tint: WELL, paint: 0, rough: 0.85 });
    // the smile: a crescent carved across the nose, found on the body's surface
    const F0 = fieldOf(s.prims.filter((p) => p.type !== 1 && !p.sub));
    this.smile = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const x = u * 0.043;
      const y = 0.084 + 0.013 * u * u;
      const p = hit(F0, [x, y, 0.1], [0, 0, 1]);
      this.smile.push([p[0], p[1], p[2] + 0.0028]);
    }
    const radii = this.smile.map((_, i) => {
      const u = (i / (n - 1)) * 2 - 1;
      return 0.0034 + 0.0052 * (1 - u * u);
    });
    s.chain(this.smile, radii, { bone: 'body', sub: true, k: 0.003, tint: MOUTH, paint: 0, rough: 0.6 });
  }

  parts(s) {
    const I = s.index;
    const F = fieldOf(s.prims);
    const q = this.q.tier === 'low' ? 0.6 : this.q.tier === 'medium' ? 0.8 : 1;
    this.hide.clearcoatRoughness = 0.06;

    // eyes in the windscreen, lids in the body colour
    this.addEyes(s, {
      c: EYE_C,
      r: EYE_R,
      dir: [0.26, 0.1, 1],
      bone: 'cabin',
      iris: 0x3d7fe0,
      iris2: 0x1a3c8c,
      irisSize: 0.74,
      pupil: 0.44,
      lid: { tint: PAINT, paint: 1, rough: 0.28, open: -0.9, closed: 1.55 },
    });

    const chrome = this.mat('solid', { metalness: 1, clearcoat: 0.3 });
    const glassMat = this.mat('solid', { clearcoat: 1 });
    const chromeLook = { tint: CHROME, rough: 0.12 };

    // ---- glass: side windows, windscreen and back window, each in a chrome frame
    const glass = [];
    const trims = [];
    const win = (origin, axis, u, v, shape, rings = 5, segs = 44) => {
      const g = panelGeometry(F, origin, axis, u, v, shape, { rings, segs, lift: 0.0011 });
      glass.push(g.panel);
      trims.push(tubeGeometry(g.rim, [0.0021, 0.0021], { radial: 7, steps: Math.round(segs * 2 * q), cap: false }));
    };
    for (const side of [1, -1]) {
      // front side window and rear side window, split by a pillar
      win([0, 0, 0], [side, 0, 0], [0, 0, 1], [0, 1, 0], squircle(0.031, 0.021, 3.2, [0.004, 0.176], { taper: 0.34, shift: -0.031 * 0.34 }));
      win([0, 0, 0], [side, 0, 0], [0, 0, 1], [0, 1, 0], squircle(0.029, 0.02, 3.2, [-0.066, 0.174], { taper: 0.36, shift: 0.029 * 0.36 }));
    }
    // windscreen (the eyes sit on it) and back window
    win([0, 0, -0.02], [0, 0, 1], [1, 0, 0], [0, 1, 0], squircle(0.058, 0.022, 3.4, [0, 0.181], { taper: 0.26 }), 6, 56);
    win([0, 0, -0.02], [0, 0, -1], [1, 0, 0], [0, 1, 0], squircle(0.042, 0.022, 3.4, [0, 0.172], { taper: 0.24 }), 5, 48);
    for (const g of glass) {
      withLook(g, { tint: GLASS, rough: 0.04 });
      // a little sky caught in the top of the glass
      tintBy(g, (x, y, z, c) => c.setRGB(0.012, 0.022, 0.035).lerp(new THREE.Color(0.1, 0.17, 0.26), smooth((y - 0.155) / 0.05)));
    }
    const glassGeo = mergeAll(glass);
    bindTo(glassGeo, I.cabin);
    this.addMesh(glassGeo, glassMat, { shadow: false }).userData.region = 40;

    // ---- chrome: window frames, bumpers, grille, headlight bezels, handles, exhaust
    const chromeParts = [...trims];
    const bumper = (zc, sign, y, r) => {
      const pts = [];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const a = lerp(-0.95, 0.95, i / n);
        const d = [Math.sin(a), 0, Math.cos(a) * sign];
        const p = hit(F, [0, y, zc], d);
        const nn = grad(F, p);
        pts.push([p[0] + nn[0] * r * 0.45, p[1] + nn[1] * r * 0.45, p[2] + nn[2] * r * 0.45]);
      }
      // two halves from the middle out, so both ends are capped
      const mid = n / 2;
      const half = (list) => tubeGeometry(list, [r, r * 0.98, r * 0.9], { radial: 14, steps: Math.round(36 * q) });
      chromeParts.push(half(pts.slice(mid)), half(pts.slice(0, mid + 1).reverse()));
    };
    bumper(0.1, 1, 0.06, 0.0105);
    bumper(-0.1, -1, 0.062, 0.0105);
    // the grille: a chrome bar along the smile
    {
      const pts = this.smile.map((p) => [p[0], p[1] - 0.0005, p[2] - 0.0052]);
      const mid = (pts.length - 1) / 2;
      const half = (list) => tubeGeometry(list, [0.0028, 0.0027, 0.0022], { radial: 10, steps: Math.round(30 * q) });
      chromeParts.push(half(pts.slice(mid)), half(pts.slice(0, mid + 1).reverse()));
    }
    // headlights: a chrome bezel and a glass lens with a reflector inside
    const lenses = [];
    for (const side of [1, -1]) {
      const p = hit(F, [0.062 * side, 0.112, 0.1], [0.12 * side, 0, 1]);
      const n = grad(F, p);
      const bez = new THREE.TorusGeometry(0.0158, 0.0034, 10, Math.round(40 * q));
      placeAlong(bez, p, n, 0.0012);
      chromeParts.push(bez);
      const lens = new THREE.SphereGeometry(0.016, Math.round(28 * q), 12, 0, TAU, 0, Math.PI / 2);
      lens.rotateX(Math.PI / 2);
      lens.scale(1, 1, 0.42);
      placeAlong(lens, p, n, -0.0015);
      withLook(lens, { tint: 0xfff3d8, rough: 0.05 });
      // reflector rings seen through the lens: bright centre, darker rim
      const o = new THREE.Vector3(...p);
      tintBy(lens, (x, y, z, c) => {
        const d = new THREE.Vector3(x, y, z).sub(o);
        const along = d.dot(new THREE.Vector3(...n));
        const r = Math.sqrt(Math.max(0, d.lengthSq() - along * along)) / 0.016;
        const ring = Math.pow(0.5 + 0.5 * Math.cos(r * 22), 3);
        const bulb = 1 - smooth(r / 0.32);
        const k = lerp(0.62, 0.3, smooth(r)) * (0.75 + 0.5 * ring) + bulb * 0.7;
        c.setRGB(1.0 * k, 0.9 * k, 0.7 * k);
      });
      lenses.push(lens);
    }
    // door handles
    for (const side of [1, -1]) {
      const p = hit(F, [0, 0.114, -0.018], [side, 0, 0]);
      const n = grad(F, p);
      const h = new THREE.CapsuleGeometry(0.0034, 0.013, 4, 10);
      h.rotateX(Math.PI / 2);
      h.translate(p[0] + n[0] * 0.0018, p[1] + n[1] * 0.0018, p[2] + n[2] * 0.0018);
      chromeParts.push(h);
    }
    // exhaust pipe under the back
    chromeParts.push(tubeGeometry([[-0.052, 0.046, -0.13], [-0.052, 0.044, -0.162], [-0.052, 0.046, -0.186]], [0.0068, 0.0068, 0.0064], { radial: 12, steps: 10 }));
    const chromeGeo = mergeAll(chromeParts.map(stripUv));
    withLook(chromeGeo, chromeLook);
    // the window frames ride on the cabin: rebind them by height
    bindBy(chromeGeo, (x, y) => [[y > 0.142 ? I.cabin : I.body, 1]]);
    this.addMesh(chromeGeo, chrome, { shadow: true }).userData.region = 41;

    // lamps: headlight lenses and tail lights (they glow when it honks or brakes)
    this.lampMat = this.mat('solid', { clearcoat: 1 });
    this.lampMat.emissive = new THREE.Color(1.0, 0.86, 0.6);
    this.lampMat.emissiveIntensity = 0;
    const headGeo = mergeAll(lenses.map(stripUv));
    bindTo(headGeo, I.body);
    this.addMesh(headGeo, this.lampMat, { shadow: false }).userData.region = 42;
    this.tailMat = this.mat('solid', { clearcoat: 1 });
    this.tailMat.emissive = new THREE.Color(1.0, 0.08, 0.05);
    this.tailMat.emissiveIntensity = 0;
    const tails = [];
    for (const side of [1, -1]) {
      const p = hit(F, [0.068 * side, 0.108, -0.1], [0.1 * side, 0, -1]);
      const n = grad(F, p);
      const g = new THREE.SphereGeometry(0.012, 20, 10, 0, TAU, 0, Math.PI / 2);
      g.rotateX(Math.PI / 2);
      g.scale(1.3, 0.85, 0.4);
      placeAlong(g, p, n, -0.0012);
      tails.push(g);
    }
    const tailGeo = mergeAll(tails.map(stripUv));
    withLook(tailGeo, { tint: 0xc4161c, rough: 0.08 });
    bindTo(tailGeo, I.body);
    this.addMesh(tailGeo, this.tailMat, { shadow: false }).userData.region = 43;

    // mirror glass on the back of each mirror
    const mirrors = [];
    for (const side of [1, -1]) {
      const g = new THREE.CircleGeometry(0.0085, 24);
      g.scale(1.25, 0.95, 1);
      g.rotateY(Math.PI);
      g.translate(0, 0, -0.0079);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, -0.25 * side, 0.12 * side)));
      g.translate(0.107 * side, 0.155, 0.064);
      withLook(g, { tint: 0xcfd6e0, rough: 0.05 });
      bindTo(g, I['mirror' + (side > 0 ? 'L' : 'R')]);
      mirrors.push(g);
    }
    const mirrorGeo = mergeSkinned(mirrors);
    this.addMesh(mirrorGeo, chrome, { shadow: false }).userData.region = 44;

    // the antenna: a thin whip with a ball on top
    {
      const b = this.antBase;
      const top = [b[0], b[1] + 0.074, b[2] - 0.012];
      const g = tubeGeometry([[b[0], b[1] - 0.004, b[2]], [b[0], b[1] + 0.036, b[2] - 0.005], top], [0.0021, 0.0015, 0.0011], { radial: 8, steps: 18 });
      const ball = new THREE.SphereGeometry(0.0068, 16, 12).translate(top[0], top[1] + 0.005, top[2]);
      const mount = new THREE.CylinderGeometry(0.0035, 0.0048, 0.006, 12).translate(b[0], b[1] + 0.001, b[2]);
      withLook(g, { tint: 0x2a2a30, rough: 0.35 });
      withLook(mount, { tint: 0x2a2a30, rough: 0.45 });
      withLook(ball, { tint: 0xffc21a, rough: 0.25 });
      const all = mergeAll([g, ball, mount].map(stripUv), true);
      bindBy(all, (x, y) => {
        const k = smooth((y - b[1] - 0.004) / 0.05);
        return [[I.ant0, 1 - k], [I.ant1, k]];
      });
      const m = this.addMesh(all, this.mat('solid', { clearcoat: 0.8 }), { shadow: true });
      m.userData.noProject = true;
    }

    // ---- wheels: fat treaded tyres on chrome hubs
    const seg = Math.round(176 * q);
    const tyres = [];
    const hubs = [];
    const tyre0 = withLook(tyreGeometry([0, 0, 0], 1, seg), { tint: RUBBER, rough: 0.82 });
    const hub0 = hubGeometry([0, 0, 0], 1, Math.round(64 * q));
    const wheels = [['wheelFL', TRACK, WB, 1], ['wheelFR', -TRACK, WB, -1], ['wheelBL', TRACK, -WB, 1], ['wheelBR', -TRACK, -WB, -1]];
    for (const [bone, x, z, side] of wheels) {
      tyres.push(bindTo(placeWheel(tyre0, side, x, AXLE, z), I[bone]));
      hubs.push(bindTo(placeWheel(hub0, side, x, AXLE, z), I[bone]));
    }
    this.addMesh(mergeSkinned(tyres), this.mat('solid'), { shadow: true }).userData.region = 45;
    this.addMesh(mergeSkinned(hubs), this.mat('solid', { metalness: 1, clearcoat: 0.5 }), { shadow: false }).userData.region = 46;
  }

  // ------------------------------------------------------------ motion

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    const sp = m.speed;
    const air = m.air;
    const idt = dt > 1e-4 ? 1 / dt : 0;
    this.blinker.hold = 0;
    this.bones.root.rotation.order = 'XYZ';

    // how it is being driven: turning rate and acceleration
    const yaw = this.object.rotation.y;
    let dy = this.lastYaw === null ? 0 : yaw - this.lastYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.lastYaw = yaw;
    this.yawRate = lerp(this.yawRate, clamp(dy * idt, -3, 3), 1 - Math.exp(-dt * 8));
    const acc = clamp((sp - this.lastSpeed) * idt, -3, 3);
    this.lastSpeed = sp;
    this.accel = lerp(this.accel, acc, 1 - Math.exp(-dt * 7));
    const moving = clamp(sp / 0.2, 0, 1) * (1 - air);

    // wheels roll with the speed; in the air they keep spinning
    this.spin += (sp / WR) * dt + air * 16 * dt;
    let steer = this.steer.update(clamp(this.yawRate * 0.55, -0.48, 0.48), dt);

    // road bumps while driving
    this.bumpIn -= dt * (0.4 + sp * 6);
    if (this.bumpIn <= 0 && sp > 0.05) {
      this.bumpIn = 0.4 + Math.random() * 0.8;
      this.heave.kick((Math.random() - 0.3) * 0.05 * clamp(sp / 0.4, 0, 1));
      this.roll.kick((Math.random() - 0.5) * 0.25 * clamp(sp / 0.4, 0, 1));
    }
    // a little exhaust puff as it pulls away
    this.puffIn -= dt;
    if (this.accel > 0.25 && this.puffIn <= 0 && air === 0) {
      this.puffIn = 2.5;
      this.exhaust();
    }

    // springs: squat on pulling away, dive on braking, lean out of turns
    const heave = this.heave.update(0, dt);
    const pitch = this.pitch.update(clamp(-this.accel * 0.05, -0.07, 0.07), dt);
    const roll = this.roll.update(clamp(this.yawRate * sp * 0.25, -0.09, 0.09), dt);
    this.brake = lerp(this.brake, this.accel < -0.2 && sp > 0.02 ? 1 : 0, 1 - Math.exp(-dt * 10));

    // alive: a slow breath, the engine's purr
    const breathe = Math.sin(t * 2.0);
    const purr = Math.sin(t * 57) * 0.00022 + Math.sin(t * 43 + 1) * 0.00016;
    // now and then it shuffles its weight, like a restless toddler
    const shuffle = Math.pow(Math.max(0, Math.sin(t * 0.43 + 1.3)), 16);
    B.body.position.y += heave + breathe * 0.0012 + purr - air * 0.002;
    B.body.rotation.x = pitch + Math.sin(t * 0.43 * 2 + 0.5) * 0.018 * shuffle - air * 0.04;
    B.body.rotation.z = roll + Math.sin(t * 5.1) * 0.012 * shuffle + Math.sin(t * 61) * 0.0012;
    B.cabin.scale.set(1 - breathe * 0.006, 1 + breathe * 0.012, 1 - breathe * 0.006);

    // the cabin is its head: it turns a little to what it looks at
    let yawT = Math.sin(t * 0.31) * 0.35 + Math.sin(t * 0.11) * 0.25;
    let tiltT = Math.sin(t * 0.23) * 0.3;
    if (this.lookLocal) {
      yawT = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z), -1, 1);
      tiltT = clamp((this.lookLocal.y - 0.16) * 0.6, -0.3, 0.4);
    }
    const hy = this.headYaw.update(yawT * (1 - moving * 0.5), dt);
    const ht = this.headTilt.update(tiltT, dt);
    B.cabin.rotation.y = hy * 0.13 + steer * 0.25;
    B.cabin.rotation.x = -ht * 0.1;
    B.cabin.rotation.z = Math.sin(t * 0.5) * 0.025 + hy * 0.03;

    // in the leap: nose up, wheels drop on their springs
    if (air > 0) {
      B.root.rotation.x -= 0.2 * air * (1 - air * 0.4);
      for (const w of AXLES) B[w].position.y -= 0.009 * air;
    }

    if (this.trick) steer = this.trickPose(this.trick, dt) ?? steer;

    // wheels
    B.steerL.rotation.y = steer;
    B.steerR.rotation.y = steer;
    for (const w of WHEELS) B[w].rotation.x = this.spin;

    // wing mirrors flap like ears: pushed by the body's movement, with a flick now and then
    const bodyVel = (pitch - this.lastPose.pitch) * idt + (heave - this.lastPose.heave) * idt * 4;
    this.mirror.kick(-bodyVel * dt * 18 - this.accel * dt * 2.5);
    const flick = Math.pow(Math.max(0, Math.sin(t * 0.7 + 2)), 30);
    const mir = this.mirror.update(flick * 0.35, dt);
    B.mirrorL.rotation.y = mir;
    B.mirrorR.rotation.y = -mir;
    B.mirrorL.rotation.z = -mir * 0.3;
    B.mirrorR.rotation.z = mir * 0.3;

    // the antenna whips about behind everything
    const rollVel = (roll - this.lastPose.roll) * idt;
    this.antX.kick(-bodyVel * dt * 60 - this.accel * dt * 6);
    this.antZ.kick(rollVel * dt * 50 - this.yawRate * sp * dt * 3);
    const ax = this.antX.update(-sp * 0.35, dt);
    const az = this.antZ.update(0, dt);
    B.ant0.rotation.set(ax * 0.5, 0, az * 0.5);
    B.ant1.rotation.set(ax, 0, az);
    this.lastPose.pitch = pitch;
    this.lastPose.roll = roll;
    this.lastPose.heave = heave;

    // lamps
    this.flash = Math.max(0, this.flash - dt * 3);
    this.lampMat.emissiveIntensity = this.flash * 2.2;
    this.tailMat.emissiveIntensity = Math.max(this.brake, this.flash * 0.6) * 1.6;
  }

  // poses for the tricks; may return a steering angle
  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    const root = B.root;
    if (tr.name === 'honk') {
      // squat down, then two honks that pop it off the ground, landing with a
      // squash each time; the headlights flash with every honk
      const squat = ramp(t, 0.0, 0.3) * (1 - ramp(t, 0.3, 0.4));
      B.body.position.y -= squat * 0.014;
      B.cabin.scale.y *= 1 - squat * 0.08;
      B.cabin.scale.x *= 1 + squat * 0.04;
      B.cabin.scale.z *= 1 + squat * 0.04;
      B.body.rotation.x += squat * 0.04;
      this.blinker.hold = squat * 0.5;
      for (const [at, dur, h, key] of HONKS) {
        const u = (t - at) / dur;
        if (u > 0 && u < 1) {
          // up and down like a ball, nose raised as it honks
          root.position.y += 4 * u * (1 - u) * h;
          root.rotation.x -= Math.sin(u * Math.PI) * 0.09 * (h / 0.022);
          const st = Math.sin(Math.min(1, u * 1.6) * Math.PI);
          B.cabin.scale.y *= 1 + st * 0.12;
          B.cabin.scale.x *= 1 - st * 0.04;
          B.cabin.scale.z *= 1 - st * 0.04;
          for (const w of AXLES) B[w].position.y -= Math.sin(u * Math.PI) * 0.006;
        }
        if (!tr[key] && t > at) {
          tr[key] = true;
          this.flash = 1;
          this.mirror.kick(-7);
          this.antX.kick(-12);
          this.emit('sound', { name: 'honk' });
          this.emit('sparkle', { at: this.restPoint('body', [0, 0.1, 0.19]), count: 16, colors: [[1.9, 1.6, 0.9], [1.4, 1.5, 2.0]], speed: 0.8, up: 0.8, size: 0.017 });
        }
        if (!tr[key + 'l'] && u >= 1) {
          tr[key + 'l'] = true;
          this.heave.kick(-0.3 * (h / 0.022));
          this.pitch.kick(0.8);
          this.mirror.kick(6);
          this.antX.kick(12);
        }
      }
      // happy squint after the honks
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 1.3, 2.0) * 0.6);
      B.cabin.rotation.z += Math.sin(t * 9) * 0.05 * bump(t, 1.25, 2.0);
      if (!tr.done && t > 1.35) {
        tr.done = true;
        this.emit('sound', { name: 'happy' });
      }
      return undefined;
    }
    if (tr.name === 'donut') {
      // rev (squat at the back), then spin a full circle round the front wheels
      const rev = ramp(t, 0.0, 0.35) * (1 - ramp(t, 0.45, 0.6));
      B.body.rotation.x -= rev * 0.05;
      B.body.position.y += Math.sin(t * 70) * 0.0012 * rev;
      const k = smooth((t - 0.45) / 1.75);
      const th = k * TAU;
      const d = WB;
      root.rotation.y += th;
      root.position.x += -d * Math.sin(th);
      root.position.z += d - d * Math.cos(th);
      const spinning = bump(t, 0.45, 2.2);
      // it leans out of the spin and its tail skids wide
      B.body.rotation.z += spinning * 0.09;
      B.body.rotation.x += spinning * 0.02;
      this.spin += dt * spinning * 38;
      this.antZ.kick(spinning * dt * 30);
      if (!tr.rev && t > 0.02) {
        tr.rev = true;
        this.emit('sound', { name: 'vroom' });
      }
      if (!tr.smoke && t > 0.3) {
        tr.smoke = true;
        this.exhaust(22, 0.6);
      }
      if (!tr.skid && t > 0.45) {
        tr.skid = true;
        this.emit('sound', { name: 'skid' });
      }
      // sprays of dusty sparkles thrown back off the tyres as they scrabble round
      tr.dust = (tr.dust ?? 0) + dt * spinning * 4.5;
      while (tr.dust > 1) {
        tr.dust -= 1;
        tr.side = -(tr.side || 1);
        const w = tr.side > 0 ? 'wheelBL' : 'wheelBR';
        _o[0] = 0.25 * tr.side;
        const at = this.bonePoint(w, TYRE, _a);
        const to = this.bonePoint(w, _o, _b);
        this.emit('puff', { at, dir: to, count: 40, speed: 0.5, push: 0.75, size: 0.028, colors: DUST });
      }
      // stop with a nose dive, then settle
      if (!tr.stop && t > 2.2) {
        tr.stop = true;
        this.pitch.kick(0.9);
        this.heave.kick(-0.08);
        this.mirror.kick(8);
        this.antX.kick(14);
        this.emit('sound', { name: 'happy' });
      }
      // a little dizzy wobble of the cabin
      B.cabin.rotation.z += wobble(t - 2.2, 1.6, 0.9) * 0.08;
      return 0.46 * spinning;
    }
    if (tr.name === 'wheelie') {
      // rev with the nose squatting back, pop up onto the back wheels,
      // balance, then drop down with a bounce
      const rev = ramp(t, 0.0, 0.45);
      const hold = 1 - ramp(t, 0.48, 0.58);
      B.body.rotation.x -= rev * 0.075 * hold;
      B.body.position.y -= rev * 0.008 * hold;
      B.body.rotation.z += Math.sin(t * 47) * 0.012 * rev * hold;
      B.body.position.y += Math.sin(t * 64) * 0.0014 * rev * (1 - ramp(t, 1.8, 2.0));
      this.blinker.hold = rev * hold * 0.35;
      if (!tr.smoke && t > 0.25) {
        tr.smoke = true;
        this.exhaust(20, 0.6);
      }
      let a = 0;
      if (t > 0.5 && t < 1.75) a = easeOutBack((t - 0.5) / 0.35, 2.4) * 0.5 + Math.sin((t - 0.85) * 7) * 0.05 * ramp(t, 0.85, 1.0);
      else if (t >= 1.75) {
        const k = clamp((t - 1.75) / 0.22, 0, 1);
        a = (0.5 + Math.sin((1.75 - 0.85) * 7) * 0.05) * (1 - k * k);
      }
      // it swings its nose round to show off its profile, and everything
      // pivots about the back axle
      const psi = 0.62 * ramp(t, 0.15, 0.6) * (1 - ramp(t, 1.95, 2.45));
      const d = -WB;
      root.rotation.order = 'YXZ';
      root.rotation.x -= a;
      root.rotation.y += psi;
      root.position.x += -d * Math.cos(a) * Math.sin(psi);
      root.position.y += -d * Math.sin(a);
      root.position.z += d - d * Math.cos(a) * Math.cos(psi);
      this.spin += dt * rev * 30 * (1 - ramp(t, 1.9, 2.1));
      B.cabin.rotation.x += a * 0.15;
      if (!tr.rev && t > 0.02) {
        tr.rev = true;
        this.emit('sound', { name: 'vroom' });
      }
      if (!tr.up && t > 0.5) {
        tr.up = true;
        this.mirror.kick(8);
        this.antX.kick(16);
      }
      if (!tr.land && t > 1.97) {
        tr.land = true;
        this.heave.kick(-0.28);
        this.pitch.kick(1.2);
        this.mirror.kick(-10);
        this.antX.kick(20);
        this.emit('land', { at: this.bonePoint('steerL', [-TRACK, -AXLE, 0]) });
        this.emit('sound', { name: 'boing' });
      }
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 2.0, 2.5) * 0.5);
      return Math.sin(t * 5) * 0.2 * bump(t, 0.8, 1.8);
    }
    return undefined;
  }

  trickLength(name) {
    return { honk: 2.1, donut: 3.0, wheelie: 2.8 }[name] || 2;
  }

  // a puff of exhaust from the pipe
  exhaust(n = 14, push = 0.4) {
    this.emit('puff', { at: this.restPoint('body', [-0.052, 0.046, -0.19]), dir: this.restPoint('body', [-0.07, 0.07, -0.5]), colors: [[1.0, 1.0, 1.05], [0.85, 0.87, 0.95]], count: n, speed: 0.35, push });
  }

  // a world point from a rest-space point carried by a bone
  restPoint(bone, p, out) {
    const b = this.sculptor.bones[this.sculptor.index[bone]].pos;
    _r[0] = p[0] - b[0];
    _r[1] = p[1] - b[1];
    _r[2] = p[2] - b[2];
    return this.bonePoint(bone, _r, out);
  }
}

const AXLES = ['steerL', 'steerR', 'wheelBL', 'wheelBR'];
const WHEELS = ['wheelFL', 'wheelFR', 'wheelBL', 'wheelBR'];
const HONKS = [[0.34, 0.34, 0.022, 'h1'], [0.8, 0.4, 0.034, 'h2']];
const DUST = [[2.0, 1.45, 0.7], [1.6, 1.15, 0.6], [2.2, 1.9, 1.2]];
const TYRE = [0, -0.044, -0.01];
const _o = [0, 0.1, -0.35];
const _r = [0, 0, 0];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// ------------------------------------------------------------ sounds

export const calls = {
  // a toy horn: meep meep
  happy(a, t) {
    glide(a, t, [[0, 880], [0.09, 905]], { type: 'square', v: 0.075, formant: 1700, q: 1.4 });
    glide(a, t + 0.15, [[0, 1046], [0.12, 1080]], { type: 'square', v: 0.075, formant: 1900, q: 1.4 });
    a.bell(2093, 0.03, t + 0.28, 0.5);
  },
  // a two-tone toy horn: honk
  honk(a, t) {
    glide(a, t, [[0, 523], [0.05, 540], [0.2, 505]], { type: 'square', v: 0.06, formant: 1100, q: 1.1 });
    glide(a, t, [[0, 659], [0.05, 680], [0.2, 640]], { type: 'square', v: 0.045, formant: 1300, q: 1.1 });
  },
  // the little engine revs up
  vroom(a, t) {
    glide(a, t, [[0, 62], [0.2, 80], [0.55, 190], [0.8, 150], [1.1, 120]], { type: 'sawtooth', v: 0.085, formant: 520, q: 0.8, trill: 24, trillDepth: 0.55 });
    puff(a, t, { v: 0.03, from: 300, to: 700, dur: 1.1 });
  },
  // tyres squeal (softly) and dust puffs
  skid(a, t) {
    glide(a, t, [[0, 1700], [0.4, 2100], [1.3, 1750]], { type: 'sine', v: 0.022, formant: 1900, q: 2, trill: 38, trillDepth: 0.35 });
    puff(a, t + 0.1, { v: 0.07, from: 500, to: 1500, dur: 1.2 });
  },
  // a bouncy spring: boi-oi-oing
  boing(a, t) {
    glide(a, t, [[0, 220], [0.06, 440], [0.3, 180]], { type: 'sine', v: 0.092, formant: 600, q: 0.8, trill: 17, trillDepth: 0.5 });
    for (let i = 0; i < 4; i++) a.bell(1600 + i * 330, 0.025, t + 0.05 + i * 0.05, 0.5);
  },
};

// ------------------------------------------------------------ wheels

// a copy of a wheel built at the origin for the left side, mirrored for the
// right-hand side, moved to its place
function placeWheel(g0, side, x, y, z) {
  const g = g0.clone();
  if (side < 0) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      p.setX(i, -p.getX(i));
      n.setX(i, -n.getX(i));
    }
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  g.translate(x, y, z);
  return g;
}

// a closed loop around a rounded rectangle in (w, rho), with its normals
function roundRectLoop(w0, w1, r0, r1, rOut, rIn, n) {
  // corners: outer top (w1, r1), inner top (w0, r1), inner bottom (w0, r0), outer bottom (w1, r0)
  const pts = [];
  const seg = (a, b, count) => {
    for (let i = 0; i < count; i++) {
      const k = i / count;
      pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 0]);
    }
  };
  const arc = (cx, cy, r, a0, a1, count, tag) => {
    for (let i = 0; i < count; i++) {
      const a = a0 + ((a1 - a0) * i) / count;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), tag]);
    }
  };
  // start on the outer sidewall low, go up, across the tread, down, back along the seat
  seg([w1, r0 + rIn], [w1, r1 - rOut], n.side);
  arc(w1 - rOut, r1 - rOut, rOut, 0, Math.PI / 2, n.shoulder, 1);
  seg([w1 - rOut, r1], [w0 + rOut, r1], n.tread);
  arc(w0 + rOut, r1 - rOut, rOut, Math.PI / 2, Math.PI, n.shoulder, 1);
  seg([w0, r1 - rOut], [w0, r0 + rIn], n.side);
  arc(w0 + rIn, r0 + rIn, rIn, Math.PI, 1.5 * Math.PI, 3, 0);
  seg([w0 + rIn, r0], [w1 - rIn, r0], 4);
  arc(w1 - rIn, r0 + rIn, rIn, 1.5 * Math.PI, 2 * Math.PI, 3, 0);
  pts.push([...pts[0]]);
  return pts;
}

// a fat toy tyre with a chunky staggered tread and softly bulging sidewalls
function tyreGeometry(c, side, seg) {
  const R = WR;
  const r0 = 0.031;
  const hw = 0.0195;
  const sh = 0.0085;
  const prof = roundRectLoop(-hw, hw, r0, R, sh, 0.002, { side: 9, shoulder: 7, tread: 18 });
  const blocks = 16;
  const depth = 0.0032;
  return latheX(c, prof, seg, side, (w, rho, th) => {
    // sidewalls bulge a little
    const sideK = Math.abs(w) > hw - 0.0005 ? Math.sin(Math.PI * clamp((rho - r0) / (R - sh - r0), 0, 1)) : 0;
    w += Math.sign(w) * sideK * 0.0022;
    // the tread: blocks across the face and over the shoulders
    const face = clamp((rho - (R - sh)) / sh, 0, 1);
    if (face > 0) {
      const ph = (th / TAU) * blocks + (w > 0 ? 0.5 : 0) + Math.abs(w) * 22;
      const fr = ph - Math.floor(ph);
      const dd = Math.min(fr, 1 - fr);
      const trans = 1 - smooth((dd - 0.06) / 0.07);
      const centre = 1 - smooth((Math.abs(w) - 0.0016) / 0.0014);
      const g = Math.max(trans, centre * (rho > R - 0.001 ? 1 : 0));
      rho -= depth * g * smooth(face * 1.6);
    }
    // a raised ring on the sidewall, like moulded lettering
    if (Math.abs(w) > hw - 0.0005 && rho > r0 + 0.009 && rho < r0 + 0.0115) w += Math.sign(w) * 0.0006;
    return [w, rho];
  });
}

// a chrome hub: a domed centre cap in the body colour, a dished face with
// five holes and a lip that meets the tyre
function hubGeometry(c, side, seg) {
  const hw = 0.0195;
  const r0 = 0.031;
  const prof = [
    [hw + 0.0055, 0.0],
    [hw + 0.0053, 0.004],
    [hw + 0.0046, 0.0075],
    [hw + 0.0032, 0.0098],
    [hw + 0.0012, 0.0108],
    [hw - 0.0012, 0.0118],
    [hw - 0.0026, 0.015],
    [hw - 0.003, 0.02],
    [hw - 0.0025, 0.0245],
    [hw - 0.0005, 0.0272],
    [hw + 0.0012, 0.0292],
    [hw + 0.0014, 0.0305],
    [hw + 0.0002, 0.0318],
    [hw - 0.004, 0.0318],
    [-hw + 0.003, 0.0318],
    [-hw + 0.003, 0.0],
  ];
  const g = latheX(c, prof, seg, side);
  withLook(g, { tint: CHROME, rough: 0.14 });
  // the cap takes the paint; five dark holes in the dish; the back is dark
  const mix = g.attributes.aMix;
  tintBy(g, (x, y, z, col, i) => {
    const w = (x - c[0]) * side;
    const dy = y - c[1], dz = z - c[2];
    const rho = Math.hypot(dy, dz);
    const th = Math.atan2(dz, dy);
    col.setHex(CHROME);
    if (w < 0) col.setRGB(0.03, 0.03, 0.035);
    // holes
    const a = (th / TAU) * 5;
    const fa = (a - Math.round(a)) * (TAU / 5) * 0.0195;
    const hole = Math.hypot(fa, rho - 0.0195);
    if (w > 0 && hole < 0.0042) col.setRGB(0.02, 0.02, 0.025);
    if (w > 0 && rho < 0.0112) {
      mix.setX(i, 0.9);
      mix.setZ(i, 0.25);
    }
  });
  return g;
}
