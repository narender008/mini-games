// Blast, a chubby tin-toy rocket: a round-bellied body of painted metal
// dotted with rivets, a chrome band where the nose cone meets it, a glowing
// bulb on the tip, three swept fins it stands on like feet, a nozzle bell
// underneath and, on its front, a big chrome-ringed porthole with its face
// inside (glossy eyes, a smile and rosy cheeks under a curved glass).
//
// It gets about in little hops, a puff from its nozzle each time it takes
// off, squashing on its fins as it lands.
//
// Tricks: 'blast' (crouches, rumbles, lights up and blasts off a metre into
// the air on a flame with a trail of smoke and sparkles, then floats back
// down and lands with a bounce), 'spin' (a pirouette on a puff of flame,
// fins flung out) and 'countdown' (three wiggles with three beeps, then a
// tiny pop of a hop: a fake-out, and a giggle).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, tintBy } from './parts.js';
import { fieldOf, hit, grad, placeAlong, stripUv, mergeAll, latheX } from './shape-kit.js';
import { addPose, bump, ramp, smooth, wobble, TAU, clamp, lerp, easeOutBack } from './anim.js';
import { SoftSpring } from './soft.js';
import { glide, puff } from '../sound/calls.js';

const WHITE = 0xf2f2f5;
const RED = 0xe53935;
const FACE = 0xf6e7d3;
const CHEEK = 0xf29a9a;
const MOUTH = 0x4a1a22;
const CHROME = 0xe4e7ec;
const GUN = 0x5d626b;

// the body's profile: points up the axis with radii (a chain of round cones)
const SPINE = [0.085, 0.13, 0.18, 0.23, 0.272, 0.305, 0.328];
const RADII = [0.05, 0.072, 0.079, 0.074, 0.058, 0.034, 0.009];
// the porthole on its front, and the face in it
const PORT = { y: 0.192, r: 0.051 };
const RING = PORT.r + 0.0062; // the chrome ring's radius, over the pocket's rim
const EYE_R = 0.0182;
const EYE_C = [0.0205, 0.201, 0.0];
const FINS = [Math.PI, Math.PI / 2, -Math.PI / 2];
// the porthole's floor: an ellipsoid round the axis, inside the body
const FLOOR = [0.0715, 0.07, 0.0715];
const floorZ = (x, y) => FLOOR[2] * Math.sqrt(Math.max(0, 1 - (x / FLOOR[0]) ** 2 - ((y - PORT.y) / FLOOR[1]) ** 2));
const FLAME_REST = 0.02; // the flame is built tiny and grown by its bone

export class Rocket extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { clearcoat: 0.9 };
    this.shared.uSplat.value = 0.15;
    this.walkSpeed = 0.25;
    this.turnRate = 2.2;
    this.hopScale = 1.2;
    this.phase = 0;
    this.hopping = 0;
    this.lean = new SoftSpring(0, 1.6, 0.5);
    this.sway = new SoftSpring(0, 1.4, 0.35);
    this.noseLag = new SoftSpring(0, 2.4, 0.25);
    this.noseLagZ = new SoftSpring(0, 2.4, 0.25);
    this.squash = new SoftSpring(0, 3, 0.35);
    this.headYaw = new SoftSpring(0, 1.2, 0.7);
    this.flameAmt = 0; // what the pose wants this frame (steps, being a max of many things)
    this.flameS = 0; // what is shown: it lights fast and dies a little slower, never blinking on or off
    this.flicker = 0;
    this.rumbleIn = 4 + Math.random() * 4;
    this.lastHop = 0;
  }

  get tricks() {
    return ['blast', 'spin', 'countdown'];
  }

  sculpt(s) {
    EYE_C[2] = floorZ(EYE_C[0], EYE_C[1]) - 0.0045;
    s.bone('root', null, [0, 0.02, 0]);
    s.bone('body', 'root', [0, 0.1, 0]);
    s.bone('nose', 'body', [0, 0.25, 0]);
    this.eyeBones(s, EYE_C, 'body');
    FINS.forEach((phi, i) => s.bone('fin' + i, 'root', [Math.sin(phi) * 0.065, 0.1, Math.cos(phi) * 0.065]));
    s.bone('flame', 'root', [0, 0.014, 0]);

    const paint = { tint: WHITE, paint: 1, rough: 0.3, pat: 0, fur: 0 };
    s.setLook(paint);
    // the body: a chubby bullet
    for (let i = 0; i < SPINE.length - 1; i++) {
      const bone = SPINE[i] >= 0.25 ? 'nose' : 'body';
      const tint = SPINE[i] >= 0.26 ? RED : WHITE;
      s.cone([0, SPINE[i], 0], [0, SPINE[i + 1], 0], RADII[i], RADII[i + 1], { bone, k: 0.012, tint });
    }
    // a skirt round the bottom where the nozzle fits
    s.ellipsoid([0, 0.058, 0], [0.046, 0.022, 0.046], { bone: 'body', k: 0.02 });
    // fins: swept, chunky, standing on their tips
    FINS.forEach((phi, i) => {
      const d = [Math.sin(phi), 0, Math.cos(phi)];
      // side fins sit a little forward so it stands steady on three toes
      const fz = phi === Math.PI ? 0 : 0.014;
      s.box([d[0] * 0.084, 0.07, d[2] * 0.084 + fz], [0.034, 0.058, 0.0085], 0.0082, { bone: 'fin' + i, k: 0.018, tint: RED, rot: [0, phi - Math.PI / 2, 0.42] });
      // its root runs a long way up the body
      s.box([d[0] * 0.07, 0.1, d[2] * 0.07 + fz * 0.5], [0.02, 0.05, 0.0075], 0.0072, { bone: 'fin' + i, k: 0.016, tint: RED, rot: [0, phi - Math.PI / 2, 0.2] });
      // a rounded toe at the tip
      s.ellipsoid([d[0] * 0.117, 0.0145, d[2] * 0.117 + fz], [0.0145, 0.0115, 0.0135], { bone: 'fin' + i, k: 0.012, tint: RED });
    });
    // the porthole: a round pocket with the face set in it; its floor
    // follows the curve of the body, a few millimetres in
    s.cone([0, PORT.y, 0.035], [0, PORT.y, 0.13], PORT.r + 0.003, PORT.r + 0.003, { bone: 'body', sub: true, k: 0.004, tint: GUN, paint: 0, rough: 0.4 });
    s.ellipsoid([0, PORT.y, 0], FLOOR, { bone: 'body', k: 0.0015, tint: FACE, paint: 0, rough: 0.5 });
    // rosy cheeks
    for (const x of [0.033, -0.033]) {
      const z = floorZ(x, 0.177);
      s.ellipsoid([x, 0.177, z - 0.0012], [0.009, 0.007, 0.0032], { bone: 'body', k: 0.003, tint: CHEEK, paint: 0, rough: 0.55 });
    }
    // the smile, carved into the face on its surface
    const F0 = fieldOf(s.prims.filter((p) => p.type !== 1));
    const smile = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const p = hit(F0, [u * 0.017, 0.175 + 0.0065 * u * u, 0.0], [0, 0, 1]);
      smile.push([p[0], p[1], p[2] + 0.0006]);
    }
    s.chain(smile, smile.map((_, i) => {
      const u = (i / (n - 1)) * 2 - 1;
      return 0.0012 + 0.0016 * (1 - u * u);
    }), { bone: 'body', sub: true, k: 0.0015, tint: MOUTH, paint: 0, rough: 0.6 });
  }

  parts(s) {
    const I = s.index;
    const F = fieldOf(s.prims);
    const q = this.q.tier === 'low' ? 0.6 : this.q.tier === 'medium' ? 0.8 : 1;
    this.hide.metalness = 0.18;
    this.hide.clearcoatRoughness = 0.08;

    this.addEyes(s, {
      c: EYE_C,
      r: EYE_R,
      dir: [0.12, 0.08, 1],
      bone: 'body',
      iris: 0x3f8ee8,
      iris2: 0x1b3f96,
      irisSize: 0.76,
      pupil: 0.44,
      lid: { tint: FACE, paint: 0.1, rough: 0.5, open: -0.75, closed: 1.5 },
    });

    const chromeMat = this.mat('solid', { metalness: 1, clearcoat: 0.4 });
    const chrome = [];
    const onBody = (y, ang, out = 0) => {
      const d = [Math.sin(ang), 0, Math.cos(ang)];
      const p = hit(F, [0, y, 0], d);
      const nn = grad(F, p);
      return { p: [p[0] + nn[0] * out, p[1] + nn[1] * out, p[2] + nn[2] * out], n: nn };
    };
    // the porthole's chrome ring, lying on the curve of the body
    {
      const pts = [];
      const N = Math.round(40 * q);
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU;
        const x = Math.cos(a) * RING, y = PORT.y + Math.sin(a) * RING;
        const p = hit(F, [x, y, 0], [0, 0, 1]);
        pts.push([p[0], p[1], p[2] - 0.0015]);
      }
      this.ringPts = pts;
      chrome.push(tubeGeometry(pts, [0.006, 0.006], { radial: 12, steps: Math.round(80 * q), cap: false }));
    }
    // a chrome band where the nose cone meets the body
    {
      const y = 0.262;
      const r = Math.hypot(...onBody(y, 0).p.filter((_, i) => i !== 1));
      const band = new THREE.TorusGeometry(r + 0.0005, 0.0042, 10, Math.round(64 * q));
      band.rotateX(Math.PI / 2).translate(0, y, 0);
      chrome.push(band);
    }
    // the nozzle bell underneath
    {
      const prof = [[0.05, 0], [0.05, 0.012], [0.046, 0.019], [0.038, 0.024], [0.03, 0.026], [0.018, 0.028], [0.004, 0.034], [-0.002, 0.036], [-0.004, 0.033], [0.004, 0.028], [0.018, 0.022], [0.03, 0.018], [0.04, 0.012], [0.046, 0.006], [0.046, 0.0]];
      // profile as [w (along the axis, up), rho]; built round x, then stood up
      const g = latheX([0, 0, 0], prof.map(([w, r]) => [w - 0.036, r]), Math.round(40 * q), 1);
      g.rotateZ(Math.PI / 2);
      g.translate(0, 0.036 + 0.014, 0);
      withLook(g, { tint: GUN, rough: 0.35 });
      // soot-dark inside the bell
      tintBy(g, (x, y, z, c, i) => c.setHex(i % prof.length >= 8 ? 0x1a1a1e : GUN));
      this.addMesh(bindTo(g, I.body), this.mat('solid', { metalness: 1, clearcoat: 0.2 }), { shadow: true }).userData.region = 41;
    }
    const chromeGeo = mergeAll(chrome.map(stripUv));
    withLook(chromeGeo, { tint: CHROME, rough: 0.12 });
    bindTo(chromeGeo, I.body);
    // the band rides on the nose
    const cp = chromeGeo.attributes.position;
    const si = chromeGeo.attributes.skinIndex;
    for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 0.25) si.setX(i, I.nose);
    this.addMesh(chromeGeo, chromeMat, { shadow: true }).userData.region = 40;

    // rivets: rows round the body and a ring round the porthole, painted over
    {
      const riv = [];
      const add = (p, n) => {
        const g = new THREE.SphereGeometry(0.0034, 8, 5, 0, TAU, 0, Math.PI / 2);
        g.rotateX(Math.PI / 2);
        placeAlong(g, p, n, -0.0012);
        riv.push(g);
      };
      for (const [y, count, bone] of [[0.244, 16, 'body'], [0.1, 16, 'body']])
        for (let i = 0; i < count; i++) {
          const a = ((i + 0.5) / count) * TAU;
          const { p, n } = onBody(y, a);
          // not over the porthole
          if (Math.abs(p[0]) < 0.06 && p[2] > 0 && Math.abs(p[1] - PORT.y) < 0.065) continue;
          add(p, n);
          void bone;
        }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.26;
        const x = Math.cos(a) * (RING + 0.0112), y = PORT.y + Math.sin(a) * (RING + 0.0112);
        const p = hit(F, [x, y, 0], [0, 0, 1]);
        add(p, grad(F, p));
      }
      const g = mergeAll(riv.map(stripUv));
      withLook(g, { tint: WHITE, paint: 0.85, rough: 0.25 });
      bindTo(g, I.body);
      const rp = g.attributes.position;
      const rs = g.attributes.skinIndex;
      for (let i = 0; i < rp.count; i++) if (rp.getY(i) > 0.25) rs.setX(i, I.nose);
      // they take the paint but stay out of the colouring outline
      this.addMesh(g, this.mat('solid', { metalness: 0.5, clearcoat: 0.6 }), { shadow: false }).userData.noProject = true;
    }

    // glass over the face: a shallow dome whose rim follows the chrome ring
    {
      const segs = Math.round(40 * q);
      const rings = 6;
      const rim = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * TAU;
        const x = Math.cos(a) * (RING - 0.004), y = PORT.y + Math.sin(a) * (RING - 0.004);
        const zr = hit(F, [Math.cos(a) * RING, PORT.y + Math.sin(a) * RING, 0], [0, 0, 1])[2];
        rim.push([x, y, zr - 0.0005]);
      }
      const zr = rim.reduce((v, p) => v + p[2], 0) / segs;
      const top = zr + 0.016;
      const pos = [0, PORT.y, top];
      for (let r = 1; r <= rings; r++) {
        const k = r / rings;
        for (let j = 0; j < segs; j++) {
          const e = rim[j];
          pos.push(e[0] * k, PORT.y + (e[1] - PORT.y) * k, lerp(top, e[2], k * k));
        }
      }
      const idx = [];
      const at = (r, j) => 1 + (r - 1) * segs + (j % segs);
      for (let j = 0; j < segs; j++) idx.push(0, at(1, j), at(1, j + 1));
      for (let r = 1; r < rings; r++)
        for (let j = 0; j < segs; j++) idx.push(at(r, j), at(r + 1, j), at(r, j + 1), at(r, j + 1), at(r + 1, j), at(r + 1, j + 1));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      if (g.attributes.normal.getZ(0) < 0) {
        const ix = g.index.array;
        for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
        g.computeVertexNormals();
      }
      withLook(g, { tint: 0xe8f2ff, rough: 0.04 });
      const glass = this.mat('solid', { clearcoat: 1 });
      glass.transparent = true;
      glass.opacity = 0.08;
      glass.depthWrite = false;
      const m = this.addMesh(bindTo(g, I.body), glass, { shadow: false });
      m.userData.noProject = true;
      m.renderOrder = 2;
    }

    // the bulb on the tip, which glows
    {
      const g = new THREE.SphereGeometry(0.0125, 18, 12).translate(0, 0.339, 0);
      withLook(g, { tint: 0xffd54a, rough: 0.15 });
      this.bulbMat = this.mat('solid', { clearcoat: 1 });
      this.bulbMat.emissive = new THREE.Color(1.0, 0.72, 0.25);
      this.bulbMat.emissiveIntensity = 0.3;
      this.addMesh(bindTo(stripUv(g), I.nose), this.bulbMat, { shadow: false }).userData.region = 42;
    }

    // the flame: built tiny at the nozzle, grown by its bone when it fires; an
    // orange outer flame round a short yellow-white core
    {
      const layer = (len, rad, n) => {
        const prof = [[0, 0]];
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const r = rad * (0.82 + 0.38 * Math.sin(Math.min(t * 2.2, 1) * Math.PI * 0.5)) * Math.pow(1 - t, 0.85);
          prof.push([-t * len, Math.max(0.0004, r)]);
        }
        prof.push([-len, 0]);
        const g = latheX([0, 0, 0], prof, 24, 1);
        g.rotateZ(Math.PI / 2);
        return g;
      };
      const outer = layer(0.17, 0.03, 16);
      const core = layer(0.085, 0.017, 10);
      const tintLayer = (g, len, hot) =>
        tintBy(withLook(g, { tint: 0xffffff, rough: 1 }), (x, y, z, c) => {
          const t = clamp(-y / len, 0, 1);
          if (hot) c.setRGB(0.55, lerp(0.46, 0.3, t), lerp(0.26, 0.08, t));
          else c.setRGB(lerp(0.9, 0.7, t), lerp(0.36, 0.08, smooth(t)), lerp(0.05, 0.01, t));
        });
      tintLayer(outer, 0.17, false);
      tintLayer(core, 0.085, true);
      const g = mergeAll([outer, core].map(stripUv));
      g.scale(FLAME_REST, FLAME_REST, FLAME_REST);
      g.translate(0, 0.014, 0);
      const mat = this.mat('solid');
      mat.transparent = true;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
      mat.emissive = new THREE.Color(1, 1, 1);
      mat.emissiveIntensity = 0;
      const base = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        base(sh, r);
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vTint * pow(abs(dot(normal, normalize(vViewPosition))), 1.3) * 1.4;\ndiffuseColor.rgb *= 0.05;');
      };
      mat.customProgramCacheKey = () => 'mb-rocket-flame';
      this.flameMat = mat;
      const m = this.addMesh(bindTo(stripUv(g), I.flame), mat, { shadow: false });
      m.userData.noProject = true;
      m.renderOrder = 3;
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
    this.flameAmt = 0;

    // hops: one every 8 cm or so, a launch, a flight and a squashy landing
    const moving = clamp(sp / 0.12, 0, 1) * (1 - air);
    this.hopping = lerp(this.hopping, moving, 1 - Math.exp(-dt * 6));
    if (this.hopping > 0.02) this.phase += dt * clamp(sp / 0.11, 1.3, 2.8);
    else this.phase = Math.ceil(this.phase);
    const ph = this.phase % 1;
    const hopK = this.hopping;
    // 0..0.18 crouch, 0.18..0.8 flight, 0.8..1 land and settle
    const flight = clamp((ph - 0.18) / 0.62, 0, 1);
    // (a sine squared: it leaves the ground and comes down to it at no speed, so a hop has no jolt)
    const hopH = flight > 0 && flight < 1 ? Math.sin(flight * Math.PI) ** 2 : 0;
    B.root.position.y += hopH * 0.06 * hopK;
    const crouch = bump(ph, 0, 0.22) + bump(ph, 0.78, 1.0) * 0.8;
    const stretch = Math.sin(flight * Math.PI) * (flight < 0.5 ? 1 : 0.4);
    // a little puff from the nozzle as it takes off
    const hopN = Math.floor(this.phase + 0.82);
    if (hopK > 0.5 && hopN !== this.lastHop) {
      this.lastHop = hopN;
      this.emit('puff', { at: this.nozzle(0.004, 0, _h0), dir: this.bonePoint('root', HOP_TO, _h1), count: 7, speed: 0.4, push: 0.5, size: 0.016, colors: EMBER });
    }
    if (hopK > 0.05 && flight > 0 && flight < 0.35) this.flameAmt = Math.max(this.flameAmt, bump(flight, 0, 0.35) * 0.35 * hopK);

    // weight: the body leans into its hops and sways over its fins
    const leanT = hopK * (0.2 * Math.sin(flight * Math.PI) - 0.08 * crouch);
    const lean = this.lean.update(leanT, dt);
    const swayT = Math.sin(t * 0.9) * 0.025 + Math.sin(t * 0.37) * 0.02;
    const sway = this.sway.update(swayT * (1 - hopK), dt);
    B.root.rotation.x += lean;
    B.root.rotation.z += sway;
    const sq = this.squash.update(-crouch * 0.16 * hopK + stretch * 0.1 * hopK, dt);
    const breathe = Math.sin(t * 2.2) * 0.012;
    B.root.scale.set(1 - sq * 0.45 - breathe * 0.4, 1 + sq + breathe, 1 - sq * 0.45 - breathe * 0.4);

    // the nose lags behind the body's moves, then catches up
    const nx = this.noseLag.update(-lean * 0.8 - (hopH - 0.5) * 0.05 * hopK, dt);
    const nz = this.noseLagZ.update(-sway * 1.2, dt);
    B.nose.rotation.x = nx * 0.5;
    B.nose.rotation.z = nz * 0.5;

    // the face looks about (the whole body turns a touch)
    let yawT = Math.sin(t * 0.33) * 0.3 + Math.sin(t * 0.13) * 0.2;
    if (this.lookLocal) yawT = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z), -0.8, 0.8);
    const hy = this.headYaw.update(yawT * (1 - hopK * 0.6), dt);
    B.body.rotation.y = hy * 0.22;
    B.body.rotation.z = Math.sin(t * 0.5) * 0.02;

    // fins flex as its weight comes down on them
    for (let i = 0; i < 3; i++) {
      const f = B[FIN_NAMES[i]];
      // splay outwards: rotate about the fin's own tangent
      const phi = FINS[i];
      const splay = crouch * 0.12 * hopK + Math.max(0, -sq) * 0.6 - stretch * 0.06 * hopK;
      f.rotation.x = -Math.cos(phi) * splay;
      f.rotation.z = Math.sin(phi) * splay;
    }

    // now and then a little rumble of excitement
    this.rumbleIn -= dt;
    if (this.rumbleIn < 0) {
      const k = bump(-this.rumbleIn, 0, 0.7);
      B.body.position.x += Math.sin(t * 60) * 0.0012 * k;
      B.body.rotation.z += Math.sin(t * 47) * 0.02 * k;
      this.flameAmt = Math.max(this.flameAmt, k * 0.12);
      if (this.rumbleIn < -0.7) this.rumbleIn = 5 + Math.random() * 6;
    }

    // leaping off the canvas: nose first, a little flame behind
    if (air > 0) {
      B.root.rotation.x += 0.35 * air;
      this.flameAmt = Math.max(this.flameAmt, air * 0.6);
      B.root.scale.y *= 1 + air * 0.06;
    }

    if (this.trick) this.trickPose(this.trick, dt);

    // the flame and the bulb
    this.flicker += dt * 40;
    this.flameS += (this.flameAmt - this.flameS) * (1 - Math.exp(-dt * (this.flameAmt > this.flameS ? 24 : 12)));
    if (this.flameAmt === 0 && this.flameS < 0.003) this.flameS = 0;
    const fl = this.flameS;
    const len = (fl * (0.85 + 0.15 * Math.sin(this.flicker) + 0.1 * Math.sin(this.flicker * 2.3 + 1))) / FLAME_REST;
    // (as wide as it is long at first, so a spark does not show as a flat disc)
    const wid = (0.6 * smooth(fl / 0.2) + Math.min(fl, 1) * 0.5) / FLAME_REST;
    B.flame.scale.set(Math.max(1e-3, wid * (0.95 + 0.05 * Math.sin(this.flicker * 1.7))), Math.max(1e-3, len), Math.max(1e-3, wid));
    this.flameMat.emissiveIntensity = 0.95 * smooth(fl / 0.02);
    this.flameMat.visible = fl > 0.002;
    this.bulbMat.emissiveIntensity = 0.25 + 0.2 * Math.pow(Math.max(0, Math.sin(t * 2.4)), 6) + fl * 1.5;
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    const root = B.root;
    if (tr.name === 'blast') {
      // crouch and rumble, ignite, rise a metre, float down, land and bounce
      const crouch = ramp(t, 0.05, 0.6) * (1 - ramp(t, 0.62, 0.75));
      const shake = ramp(t, 0.2, 0.65) * (1 - ramp(t, 0.9, 1.1));
      root.scale.y *= 1 - crouch * 0.14;
      root.scale.x *= 1 + crouch * 0.07;
      root.scale.z *= 1 + crouch * 0.07;
      B.body.position.x += Math.sin(t * 70) * 0.0022 * shake;
      root.rotation.z += Math.sin(t * 53) * 0.03 * shake;
      this.blinker.hold = crouch * 0.6;
      // flight: up fast, a hover, down gently
      const up = t < 0.65 ? 0 : t < 1.6 ? smooth((t - 0.65) / 0.95) : t < 2.1 ? 1 : 1 - smooth((t - 2.1) / 0.9);
      const hover = bump(t, 1.4, 2.3);
      root.position.y += up * 0.95 + Math.sin(t * 5) * 0.02 * hover;
      root.rotation.z += Math.sin(t * 3.1) * 0.06 * hover;
      // stretched as it shoots up
      const zoom = bump(t, 0.62, 1.4);
      root.scale.y *= 1 + zoom * 0.14;
      root.scale.x *= 1 - zoom * 0.06;
      root.scale.z *= 1 - zoom * 0.06;
      // flame: a flicker in the crouch, a roar on lift-off, gentle coming down
      this.flameAmt = Math.max(this.flameAmt, shake * 0.35, bump(t, 0.6, 1.9) * 1.1 + ramp(t, 0.6, 0.7) * (1 - ramp(t, 1.5, 1.8)) * 0.3, bump(t, 1.5, 2.4) * 0.4, bump(t, 2.1, 3.0) * 0.5);
      // splayed fins in flight
      for (let i = 0; i < 3; i++) {
        const phi = FINS[i];
        const k = up * 0.25 - crouch * 0.05;
        addPose(B[FIN_NAMES[i]], -Math.cos(phi) * k, 0, Math.sin(phi) * k);
      }
      if (!tr.rumble && t > 0.15) {
        tr.rumble = true;
        this.emit('sound', { name: 'rumble' });
      }
      if (!tr.fired && t > 0.62) {
        tr.fired = true;
        this.emit('sound', { name: 'blast' });
        // a cloud of smoke rolling out along the ground
        this.ring(0.012, 0.5, 0.16, 22, 0.45, 0.9, 0.03, SMOKE);
      }
      // a trail of sparks and smoke while it climbs
      if (t > 0.65 && t < 2.7) {
        tr.trail = (tr.trail ?? 0) + dt * (t < 1.8 ? 6 : 3);
        while (tr.trail > 1) {
          tr.trail -= 1;
          this.emit('puff', { at: this.nozzle(-0.03, 0, _a), dir: this.nozzle(-0.6, 0, _b), count: t < 1.8 ? 12 : 9, speed: 0.34, push: 0.7, size: 0.022, colors: TRAIL });
        }
      }
      if (!tr.landed && t > 3.0) {
        tr.landed = true;
        this.squash.kick(-1.6);
        this.lean.kick(0.4);
        this.emit('land', { at: this.bonePoint('root') });
        this.emit('sound', { name: 'land' });
      }
    } else if (tr.name === 'spin') {
      // a pirouette: crouch, pop up on a puff of flame, spin twice, land
      const crouch = bump(t, 0.0, 0.4);
      const hop = t > 0.35 && t < 1.55 ? Math.sin(((t - 0.35) / 1.2) * Math.PI) : 0;
      root.scale.y *= 1 - crouch * 0.12 + hop * 0.05;
      root.scale.x *= 1 + crouch * 0.06;
      root.scale.z *= 1 + crouch * 0.06;
      root.position.y += hop * 0.1;
      root.rotation.y += smooth((t - 0.35) / 1.25) * TAU * 2;
      for (let i = 0; i < 3; i++) {
        const phi = FINS[i];
        const k = hop * 0.45;
        addPose(B[FIN_NAMES[i]], -Math.cos(phi) * k, 0, Math.sin(phi) * k);
      }
      this.flameAmt = Math.max(this.flameAmt, bump(t, 0.3, 0.9) * 0.7);
      this.blinker.hold = hop * 0.5;
      if (!tr.fired && t > 0.35) {
        tr.fired = true;
        this.emit('sound', { name: 'whirl' });
        this.ring(0.012, 0.3, 0.3, 7, 0.6, 0.6, 0.022, EMBER);
      }
      if (hop > 0.3) {
        tr.spark = (tr.spark ?? 0) + dt * 4;
        while (tr.spark > 1) {
          tr.spark -= 1;
          this.emit('sparkle', { at: this.bonePoint(FIN_NAMES[Math.floor(Math.random() * 3)], FIN_TIP, _c), count: 7, speed: 0.5, up: 0.2, size: 0.016, colors: GLINT });
        }
      }
      if (!tr.landed && t > 1.55) {
        tr.landed = true;
        this.squash.kick(-1.2);
        this.noseLagZ.kick(3);
        this.emit('land', { at: this.bonePoint('root') });
        this.emit('sound', { name: 'happy' });
      }
      // a little dizzy wobble after
      root.rotation.z += wobble(t - 1.55, 1.5, 0.9) * 0.12;
    } else if (tr.name === 'countdown') {
      // 3, 2, 1: three wiggles, each bigger, with a beep; then a tiny pop
      for (let i = 0; i < 3; i++) {
        const at = BEEPS[i];
        const w = bump(t, at, at + 0.45);
        const u = (t - at) / 0.45;
        const amp = 0.12 + i * 0.06;
        // rock side to side on its toes, bob up, squash as it counts
        root.rotation.z += Math.sin(u * TAU) * amp * (w > 0 ? 1 : 0);
        root.position.y += Math.max(0, Math.sin(u * TAU * 2)) * 0.008 * (i + 1) * (w > 0 ? 1 : 0);
        root.scale.y *= 1 - w * 0.05 * (i + 1);
        root.scale.x *= 1 + w * 0.025 * (i + 1);
        root.scale.z *= 1 + w * 0.025 * (i + 1);
        if (!tr[BEEP_KEYS[i]] && t > at) {
          tr[BEEP_KEYS[i]] = true;
          this.emit('sound', { name: 'beep' + (3 - i) });
          this.emit('sparkle', { at: this.bonePoint('nose', [0, 0.1, 0]), count: 5 + i * 3, speed: 0.4, up: 0.5, size: 0.015, colors: [[2.0, 1.5, 0.6]] });
        }
      }
      // the flame flickers hopefully...
      this.flameAmt = Math.max(this.flameAmt, bump(t, 1.45, 1.75) * 0.5);
      // ...and it only manages a tiny hop
      const pop = t > 1.6 && t < 1.95 ? Math.sin(((t - 1.6) / 0.35) * Math.PI) : 0;
      root.position.y += pop * 0.035;
      root.scale.y *= 1 + pop * 0.08;
      this.blinker.hold = bump(t, 1.95, 2.6) * 0.65;
      root.rotation.z += Math.sin(t * 14) * 0.035 * bump(t, 1.95, 2.6);
      if (!tr.pop && t > 1.6) {
        tr.pop = true;
        this.ring(0.012, 0.25, 0.25, 5, 0.4, 0.5, 0.02, EMBER);
        this.emit('sound', { name: 'pop' });
      }
      if (!tr.landed && t > 1.95) {
        tr.landed = true;
        this.squash.kick(-0.8);
        this.emit('sound', { name: 'happy' });
      }
    }
  }

  trickLength(name) {
    return { blast: 3.6, spin: 2.3, countdown: 2.7 }[name] || 2;
  }

  // a world point below the nozzle (dz: towards the back)
  nozzle(dy = 0, dz = 0, out) {
    _n[1] = -0.006 + dy;
    _n[2] = dz;
    return this.bonePoint('root', _n, out);
  }

  // puffs rolling out and up all round its foot: three of them, r metres
  // out and h up, from dy above the nozzle
  ring(dy, r, h, count, speed, push, size, colors) {
    const at = this.nozzle(dy, 0, _ra);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      const to = _ring[i].set(Math.sin(a) * r, h, Math.cos(a) * r).add(at);
      this.emit('puff', { at, dir: to, count, speed, push, size, colors });
    }
  }
}

const EMBER = [[1.9, 1.3, 0.6], [1.1, 1.1, 1.15]];
const SMOKE = [[1.2, 1.2, 1.25], [1.0, 1.0, 1.05], [1.9, 1.4, 0.7]];
const TRAIL = [[2.0, 1.4, 0.6], [2.0, 1.8, 1.0], [1.1, 1.1, 1.15]];
const GLINT = [[1.9, 1.6, 0.9], [1.4, 1.5, 2.0]];
const FIN_NAMES = ['fin0', 'fin1', 'fin2'];
const FIN_TIP = [0, -0.07, 0];
const HOP_TO = [0, 0.12, -0.3];
const BEEPS = [0.1, 0.6, 1.1];
const BEEP_KEYS = ['b0', 'b1', 'b2'];
const _n = [0, 0, 0];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _h0 = new THREE.Vector3();
const _h1 = new THREE.Vector3();
const _ra = new THREE.Vector3();
const _ring = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

// ------------------------------------------------------------ sounds

export const calls = {
  // a cheerful bleep-bloop
  happy(a, t) {
    glide(a, t, [[0, 660], [0.08, 990]], { type: 'sine', v: 0.08, formant: 1400, q: 0.8 });
    glide(a, t + 0.12, [[0, 1175], [0.1, 1320], [0.16, 1245]], { type: 'sine', v: 0.07, formant: 1800, q: 0.8, trill: 22, trillDepth: 0.4 });
  },
  rumble(a, t) {
    puff(a, t, { v: 0.06, from: 120, to: 300, dur: 0.55 });
    glide(a, t, [[0, 55], [0.5, 70]], { type: 'sawtooth', v: 0.05, formant: 260, q: 0.7, trill: 30, trillDepth: 0.6 });
  },
  // lift-off: a whoosh and a firework whistle that rise away, with a twinkle
  blast(a, t) {
    puff(a, t, { v: 0.12, from: 300, to: 2600, dur: 1.4 });
    glide(a, t, [[0, 320], [1.1, 1500]], { type: 'sine', v: 0.035, formant: 1100, q: 0.7 });
    for (let i = 0; i < 6; i++) a.bell(1568 + i * 262, 0.025, t + 0.5 + i * 0.07, 0.6);
  },
  // a springy boing as it lands
  land(a, t) {
    glide(a, t, [[0, 260], [0.07, 420], [0.28, 200]], { type: 'sine', v: 0.1, formant: 600, q: 0.8, trill: 17, trillDepth: 0.5 });
    puff(a, t, { v: 0.05, from: 400, to: 900, dur: 0.3 });
  },
  whirl(a, t) {
    glide(a, t, [[0, 500], [0.6, 1500], [1.1, 900]], { type: 'sine', v: 0.06, formant: 1200, q: 0.8, trill: 13, trillDepth: 0.5 });
    puff(a, t, { v: 0.05, from: 500, to: 1600, dur: 0.8 });
  },
  beep3(a, t) {
    glide(a, t, [[0, 880], [0.12, 880]], { type: 'sine', v: 0.07, formant: 1200, q: 0.6 });
  },
  beep2(a, t) {
    glide(a, t, [[0, 988], [0.12, 988]], { type: 'sine', v: 0.07, formant: 1300, q: 0.6 });
  },
  beep1(a, t) {
    glide(a, t, [[0, 1175], [0.16, 1175]], { type: 'sine', v: 0.08, formant: 1500, q: 0.6 });
  },
  // a tiny, slightly deflated pop
  pop(a, t) {
    puff(a, t, { v: 0.07, from: 900, to: 400, dur: 0.25 });
    glide(a, t + 0.05, [[0, 700], [0.25, 420]], { type: 'sine', v: 0.06, formant: 800, q: 0.8 });
  },
};
