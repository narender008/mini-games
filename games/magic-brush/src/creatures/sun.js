// Sunny, a sun friend: a round, glowing, beaming face (big glossy eyes,
// rosy cheeks, a wide smile) in a ring of soft rounded rays that turn
// slowly and pulse, a warm halo behind, and two fluffy cumulus clouds
// cuddled up at its chin. The child's colours tint the sun and its rays.
//
// It lives up in the sky over the garden: it floats and bobs, its rays
// turning and breathing, its glow pulsing gently, the clouds drifting.
//
// Tricks: 'wink' (a big beaming wink with a burst of sparkles and its rays
// flaring out), 'spin' (whirls its rays round fast) and 'peek' (ducks down
// behind its clouds as they puff up, then pops up: peekaboo!).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { withLook, bindTo, tintBy } from './parts.js';
import { fieldOf, hit, grad, stripUv, mergeAll, mergeSkinned } from './shape-kit.js';
import { bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp, easeOutBack } from './anim.js';
import { glide, puff } from '../sound/calls.js';

const SUN = 0xffc93c;
const RAY = 0xff9a3c;
const CLOUD = 0xfbfbff;
const MOUTH = 0x7a2a12;
const CHEEK = 0xff7a5a;

const SC = [0, 0.19, 0]; // the sun's middle
const SR = [0.1, 0.1, 0.07];
const EYE_R = 0.023;
const RAYS = 12;

// two clouds: lumps [centre, radius]
const CLOUDS = [
  { bone: 'cloudA', c: [-0.13, 0.05, 0.06], lumps: [[[0, 0.012, 0], 0.05], [[-0.058, 0.0, 0.0], 0.036], [[0.052, 0.002, 0.005], 0.04], [[0.012, 0.052, -0.006], 0.036], [[-0.03, 0.042, 0.0], 0.03], [[0.08, 0.0, -0.004], 0.028]] },
  { bone: 'cloudB', c: [0.14, 0.052, 0.05], lumps: [[[0, 0.01, 0], 0.042], [[0.046, 0.0, 0.0], 0.032], [[-0.044, 0.004, 0.004], 0.034], [[-0.004, 0.046, -0.004], 0.03]] },
];

export class Sun extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { sheen: 0.3, clearcoat: 0.2 };
    this.shared.uSplat.value = 0.25;
    this.walkSpeed = 0;
    this.turnRate = 0.8;
    this.worldScale = 4.4;
    this.hopScale = 0.6;
    this.sparkleColors = [[2.4, 1.9, 0.7], [2.3, 1.4, 0.5], [2.4, 2.2, 1.4]];
    this.glowU = { uSunGlow: { value: 0.42 } };
    this.spin = 0;
    this.spinV = 0.25;
    this.flare = new Spring(0, 2.2, 0.3);
    this.bob = new Spring(0, 1.8, 0.3);
    this.puffs = [new Spring(0, 2.4, 0.25), new Spring(0, 2.4, 0.25)];
  }

  get tricks() {
    return ['wink', 'spin', 'peek'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0, 0]);
    s.bone('sun', 'root', SC);
    s.bone('rays', 'sun', SC);
    s.bone('raysB', 'rays', SC);
    for (const c of CLOUDS) s.bone(c.bone, 'root', c.c);

    // the face
    const FS = fieldOf([{ type: 0, c: SC, r: SR, k: 0.001, m: null, sub: false }]);
    const pe = hit(FS, [0.036, SC[1] + 0.022, 0], [0.25, 0.08, 1]);
    const ne = grad(FS, pe);
    this.eyeC = [pe[0] - ne[0] * EYE_R * 0.42, pe[1] - ne[1] * EYE_R * 0.42, pe[2] - ne[2] * EYE_R * 0.42];
    this.eyeBones(s, this.eyeC, 'sun');

    // the sun glows: its look's fur channel (unused, it isn't furry) says how much
    const sun = { tint: SUN, paint: 1, rough: 0.45, pat: 0, fur: 1 };
    s.setLook(sun);
    s.ellipsoid(SC, SR, { bone: 'sun', k: 0.001 });
    // cheeks, puffed and rosy
    for (const e of [1, -1]) {
      const p = hit(FS, [e * 0.058, SC[1] - 0.018, 0], [e * 0.5, -0.1, 1]);
      const n = grad(FS, p);
      s.sphere([p[0] - n[0] * 0.009, p[1] - n[1] * 0.009, p[2] - n[2] * 0.009], 0.016, { bone: 'sun', k: 0.006, tint: CHEEK, paint: 0.3, fur: 0.6 });
    }
    // a wide smile
    const smile = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const p = hit(FS, [u * 0.037, SC[1] - 0.034 + 0.019 * u * u, 0], [0, 0, 1]);
      smile.push([p[0], p[1], p[2] + 0.002]);
    }
    s.chain(smile, smile.map((_, i) => {
      const u = (i / (n - 1)) * 2 - 1;
      return 0.0022 + 0.0062 * (1 - u * u);
    }), { bone: 'sun', sub: true, k: 0.0022, tint: MOUTH, paint: 0, fur: 0, rough: 0.6 });

    // the clouds, fluffy and white, cuddled up at its chin
    const fluff = { tint: CLOUD, paint: 0.25, rough: 0.95, fur: 0 };
    for (const c of CLOUDS) {
      for (const [o, r] of c.lumps) s.sphere([c.c[0] + o[0], c.c[1] + o[1], c.c[2] + o[2]], r, { bone: c.bone, k: 0.016, ...fluff });
      s.box([c.c[0], c.c[1] - 0.14, c.c[2]], [0.15, 0.1, 0.1], 0, { bone: c.bone, sub: true, k: 0.012, ...fluff });
    }
  }

  parts(s) {
    const I = s.index;
    const q = this.q.tier === 'low' ? 0.6 : this.q.tier === 'medium' ? 0.8 : 1;

    // the hide glows where its look says so
    const glowHook = (mat, key) => {
      const base = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        base.call(mat, sh, r);
        Object.assign(sh.uniforms, this.glowU);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uSunGlow;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n{ float alive = uAliveOn > 0.5 ? vAlive : 1.0; totalEmissiveRadiance += diffuseColor.rgb * vMix.y * uSunGlow * alive; }`);
      };
      mat.customProgramCacheKey = () => key;
    };
    glowHook(this.hide, 'mb-sun-hide');

    this.addEyes(s, {
      c: this.eyeC,
      r: EYE_R,
      dir: [0.24, 0.06, 1],
      bone: 'sun',
      iris: 0x7a4a1e,
      iris2: 0x3a1c08,
      irisSize: 0.78,
      pupil: 0.46,
      lid: { tint: SUN, paint: 1, fur: 1, rough: 0.45, open: -0.7, closed: 1.55 },
    });

    // ---- rays: long and short, rounded and a little puffy, in two rings
    const rayGeo = (len, base, tipR) => {
      const prof = [];
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        prof.push(new THREE.Vector2(lerp(base, tipR, u), u * len));
      }
      for (let i = 1; i <= 5; i++) {
        const a = (i / 5) * (Math.PI / 2);
        prof.push(new THREE.Vector2(tipR * Math.cos(a), len + tipR * Math.sin(a)));
      }
      const g = new THREE.LatheGeometry(prof, Math.round(16 * q));
      g.scale(1, 1, 0.55);
      return g;
    };
    const ringA = [];
    const ringB = [];
    for (let i = 0; i < RAYS; i++) {
      const long = i % 2 === 0;
      const th = (i / RAYS) * TAU;
      const g = long ? rayGeo(0.07, 0.024, 0.0105) : rayGeo(0.048, 0.019, 0.0085);
      g.translate(0, SR[0] - 0.012, 0);
      g.rotateZ(th - Math.PI / 2);
      g.translate(SC[0], SC[1], SC[2] - 0.012);
      withLook(stripUv(g), { tint: long ? RAY : SUN, paint: 0.6, fur: 1, rough: 0.4 });
      tintBy(g, (x, y, z, c) => {
        const r = Math.hypot(x - SC[0], y - SC[1]);
        c.setHex(long ? RAY : SUN).lerp(new THREE.Color(0xfff3c0), smooth(1 - (r - SR[0]) / 0.07) * 0.35);
      });
      (long ? ringA : ringB).push(g);
    }
    const rays = mergeSkinned([bindTo(mergeAll(ringA, true), I.rays), bindTo(mergeAll(ringB, true), I.raysB)]);
    const rm = this.mat('solid', { clearcoat: 0.5 });
    glowHook(rm, 'mb-sun-rays');
    this.addMesh(rays, rm, { shadow: true }).userData.region = 40;

    // ---- a warm halo behind
    {
      const g = new THREE.PlaneGeometry(0.56, 0.56, 1, 1);
      g.translate(SC[0], SC[1], SC[2] - 0.05);
      withLook(stripUv(g), { tint: 0xffffff });
      bindTo(g, I.sun);
      const mat = this.mat('solid');
      mat.transparent = true;
      mat.depthWrite = false;
      mat.blending = THREE.AdditiveBlending;
      const base = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        base.call(mat, sh, r);
        Object.assign(sh.uniforms, this.glowU);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHalo;').replace('#include <begin_vertex>', `#include <begin_vertex>\nvHalo = position.xy - vec2(${SC[0].toFixed(3)}, ${SC[1].toFixed(3)});`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vHalo;\nuniform float uSunGlow;')
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            float mbHalo = length(vHalo) / 0.28;
            mbHalo = (exp(-mbHalo * mbHalo * 4.0) * 0.7 + exp(-mbHalo * 3.0) * 0.2) * smoothstep(1.0, 0.8, mbHalo) * (uAliveOn > 0.5 ? vAlive : 1.0) * (0.6 + uSunGlow * 0.7);`,
          )
          // only the glow: no lighting on the card at all
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor = vec4(vec3(1.0, 0.72, 0.35) * mbHalo, 1.0);');
      };
      mat.customProgramCacheKey = () => 'mb-sun-halo';
      const m = this.addMesh(g, mat, { shadow: false, receive: false });
      m.userData.noProject = true;
      m.renderOrder = -1;
    }
  }

  // ------------------------------------------------------------ motion

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const air = this.motion.air;
    this.blinker.hold = 0;
    if (this.winking === undefined) this.winking = this.lids[0].open;
    this.lids[0].open = this.winking;

    // up in the sky it hangs from its middle, not from its clouds
    // (only once settled at home: never while it comes off the canvas)
    const high = this.atHome ? 1 : 0;
    this.high = this.high === undefined ? high : lerp(this.high, high, 1 - Math.exp(-dt * 4));
    B.root.position.y -= this.high * 0.17;

    // floating and beaming
    const bob = this.bob.update(0, dt);
    B.root.position.y += Math.sin(t * 1.0) * 0.005;
    B.root.rotation.z = Math.sin(t * 0.55) * 0.02;
    B.sun.position.y += Math.sin(t * 1.3 + 0.5) * 0.003 + bob * 0.03;
    const breathe = Math.sin(t * 1.9);
    B.sun.scale.set(1 + breathe * 0.012 - bob * 0.2, 1 - breathe * 0.008 + bob * 0.3, 1);
    B.sun.rotation.z = Math.sin(t * 0.4) * 0.05;
    // the face turns a little to what it looks at
    if (this.lookLocal) B.sun.rotation.y = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z), -0.5, 0.5) * 0.3;

    // rays: turning slowly, long and short ones breathing in turn
    const fl = this.flare.update(0, dt);
    this.spin += dt * this.spinV;
    B.rays.rotation.z = this.spin;
    const pulse = Math.sin(t * 2.2);
    B.rays.scale.setScalar(1 + pulse * 0.035 + fl * 0.25 + air * 0.08);
    B.raysB.scale.setScalar(1 - pulse * 0.06 + fl * 0.1);
    B.raysB.rotation.z = Math.sin(t * 0.8) * 0.06;

    // the clouds drift and puff
    for (let i = 0; i < CLOUDS.length; i++) {
      const p = this.puffs[i].update(0, dt);
      const b = B[CLOUDS[i].bone];
      b.position.x += Math.sin(t * 0.37 + i * 2) * 0.004;
      b.position.y += Math.sin(t * 0.9 + i * 1.3) * 0.003;
      b.scale.setScalar(1 + Math.sin(t * 1.2 + i) * 0.015 + p * 0.3);
    }

    this.glowU.uSunGlow.value = 0.42 + Math.sin(t * 1.5) * 0.05 + fl * 0.5;
    if (this.trick) this.trickPose(this.trick, dt);
    if (this.trick?.name !== 'spin') this.spinV = lerp(this.spinV, 0.25, 1 - Math.exp(-dt * 1.5));
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'wink') {
      // a squash of joy, then a big wink and a burst of sparkles
      const pre = ramp(t, 0, 0.3) * (1 - ramp(t, 0.3, 0.45));
      B.sun.scale.y *= 1 - pre * 0.08;
      B.sun.scale.x *= 1 + pre * 0.05;
      const wink = bump(t, 0.45, 1.4);
      this.lids[0].open = lerp(this.winking, 1.55, smooth(clamp(wink * 3, 0, 1)));
      B.sun.rotation.z += wink * 0.12;
      if (!tr.a && t > 0.45) {
        tr.a = true;
        this.flare.kick(4);
        this.bob.kick(1.5);
        this.emit('sound', { name: 'wink' });
        this.emit('sparkle', { at: this.restPoint('sun', [SC[0] + 0.03, SC[1] + 0.03, 0.08]), count: 60, colors: this.sparkleColors, speed: 1.1, up: 0.6, size: 0.024, life: 1.4 });
      }
      if (!tr.b && t > 1.5) {
        tr.b = true;
        this.emit('sound', { name: 'happy' });
      }
      this.blinker.hold = bump(t, 1.5, 2.3) * 0.45;
      return;
    }
    if (tr.name === 'spin') {
      // whirl the rays round fast, glowing brighter
      const v = bump(t, 0.2, 2.4);
      this.spinV = 0.25 + smooth(clamp(v * 1.4, 0, 1)) * 9;
      this.glowU.uSunGlow.value += v * 0.4;
      B.rays.scale.multiplyScalar(1 + v * 0.12);
      this.blinker.hold = v * 0.8;
      B.sun.rotation.z += Math.sin(t * 5) * 0.04 * v;
      if (!tr.a && t > 0.2) {
        tr.a = true;
        this.emit('sound', { name: 'whirl' });
      }
      tr.sp = (tr.sp ?? 0) + dt * 5 * v;
      while (tr.sp > 1) {
        tr.sp -= 1;
        const a = Math.random() * TAU;
        _p[0] = SC[0] + Math.cos(a) * 0.17;
        _p[1] = SC[1] + Math.sin(a) * 0.17;
        this.emit('sparkle', { at: this.restPoint('sun', _p, _a), count: 10, speed: 0.5, up: 0.2, size: 0.018, life: 0.9 });
      }
      if (!tr.b && t > 2.2) {
        tr.b = true;
        this.emit('sound', { name: 'happy' });
      }
      return;
    }
    if (tr.name === 'peek') {
      // clouds puff up, the sun ducks behind them... peekaboo!
      const down = ramp(t, 0.15, 0.55) * (1 - ramp(t, 1.25, 1.45));
      B.sun.position.y -= down * 0.075;
      B.sun.scale.multiplyScalar(1 - down * 0.08);
      for (const c of CLOUDS) {
        B[c.bone].scale.multiplyScalar(1 + down * 0.35);
        B[c.bone].position.y += down * 0.02;
      }
      this.blinker.hold = down;
      if (!tr.a && t > 0.15) {
        tr.a = true;
        this.emit('sound', { name: 'duck' });
      }
      if (!tr.b && t > 1.3) {
        tr.b = true;
        this.bob.kick(3);
        this.flare.kick(2.5);
        for (const p of this.puffs) p.kick(-1.5);
        this.emit('sound', { name: 'peek' });
        this.emit('sparkle', { at: this.restPoint('sun', [SC[0], SC[1] + 0.06, 0.08]), count: 36, speed: 0.9, up: 0.8, size: 0.022 });
        for (const c of CLOUDS) this.emit('sparkle', { at: this.restPoint(c.bone, [c.c[0], c.c[1] + 0.04, c.c[2] + 0.04]), count: 10, colors: [[2.1, 2.1, 2.2]], speed: 0.4, up: 0.3, size: 0.02 });
      }
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 1.7, 2.4) * 0.5);
    }
  }

  trickLength(name) {
    return { wink: 2.4, spin: 2.6, peek: 2.5 }[name] || 2;
  }

  restPoint(bone, p, out) {
    const b = this.sculptor.bones[this.sculptor.index[bone]].pos;
    _r[0] = p[0] - b[0];
    _r[1] = p[1] - b[1];
    _r[2] = p[2] - b[2];
    return this.bonePoint(bone, _r, out);
  }
}

const _p = [0, 0, 0];
const _r = [0, 0, 0];
const _a = new THREE.Vector3();

export const calls = {
  // a bright glint: a quick whistle up and a sprinkle of bells
  happy(a, t) {
    glide(a, t, [[0, 1047], [0.12, 1319]], { type: 'sine', v: 0.06, formant: 1400, q: 0.8 });
    a.bell(1568, 0.026, t + 0.12, 0.8);
    a.bell(2093, 0.022, t + 0.24, 0.9);
  },
  // bling!
  wink(a, t) {
    glide(a, t, [[0, 880], [0.08, 1319]], { type: 'sine', v: 0.07, formant: 1500, q: 0.8 });
    for (const [i, f] of [1568, 2093, 2637, 3136].entries()) a.bell(f, 0.024, t + 0.06 + i * 0.05, 1.0);
  },
  // the rays whirl round: a fluttering swirl on a rushing breeze
  whirl(a, t) {
    glide(a, t, [[0, 440], [0.9, 1320], [1.9, 700]], { type: 'sine', v: 0.06, formant: 1100, q: 0.8, trill: 12, trillDepth: 0.5 });
    puff(a, t, { v: 0.05, from: 700, to: 2600, dur: 1.8 });
  },
  // ducking down behind the clouds: a slide whistle down
  duck(a, t) {
    glide(a, t, [[0, 660], [0.35, 330]], { type: 'sine', v: 0.07, formant: 800, q: 0.8 });
  },
  // peekaboo: a pop, a slide whistle up and a ting
  peek(a, t) {
    puff(a, t, { v: 0.05, from: 1400, to: 700, dur: 0.12 });
    glide(a, t + 0.04, [[0, 700], [0.14, 1400]], { type: 'sine', v: 0.07, formant: 1200, q: 0.8 });
    for (const [i, f] of [1976, 2637].entries()) a.bell(f, 0.024, t + 0.2 + i * 0.08, 0.8);
  },
};
