// Arc, a rainbow friend: six soft, glowing candy bands arching between two
// fluffy clouds, and each cloud has a happy face (big glossy eyes, rosy
// cheeks, a smile). The child's colours tint the bands and the clouds.
//
// It lives up in the sky over the garden: it floats, bobbing and swaying,
// the clouds puffing gently, a slow shimmer running along its bands.
//
// Tricks: 'shimmer' (a wave of bright colour runs along the bands and back,
// trailing sparkles), 'bounce' (the clouds hop in turn, then together,
// flexing the arch) and 'shower' (it arches up tall and showers rainbow
// sparkles down).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { withLook, bindTo, bindBy, tintBy, eyeGeometry, lidGeometry } from './parts.js';
import { fieldOf, hit, grad, mergeAll } from './shape-kit.js';
import { bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp } from './anim.js';
import { glide, puff } from '../sound/calls.js';

const CLOUD = 0xfbfbff;
const MOUTH = 0x5a3040;
const CHEEK = 0xff9ab5;
const BANDS = [0xe53935, 0xff9800, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa];
const SPARKS = [[2.2, 0.7, 0.6], [2.2, 1.4, 0.4], [2.2, 2.0, 0.5], [0.8, 2.0, 0.8], [0.6, 1.2, 2.2], [1.6, 0.7, 2.1]];

const CY = 0.02; // the arc's centre height
const RIN = 0.155;
const ROUT = 0.245;
const CX = 0.2; // the clouds sit at the arc's feet, x = ±CX
const EYE_R = 0.0152;

// fluffy lumps of one cloud, for the cloud at +x (mirrored for -x)
const LUMPS = [
  [[0, 0.05, 0.01], 0.052],
  [[0.046, 0.034, 0.004], 0.037],
  [[-0.043, 0.036, 0.008], 0.039],
  [[-0.012, 0.086, -0.002], 0.034],
  [[0.02, 0.078, 0.0], 0.03],
  [[0.006, 0.03, 0.036], 0.03],
];

export class Rainbow extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { sheen: 1, clearcoat: 0 };
    this.shared.uSplat.value = 0.25;
    this.walkSpeed = 0;
    this.turnRate = 0.8;
    this.worldScale = 4.6;
    this.hopScale = 0.6;
    this.sparkleColors = SPARKS;
    this.puffs = [new Spring(0, 2.4, 0.25), new Spring(0, 2.4, 0.25)];
    this.flex = new Spring(0, 2.0, 0.25);
    this.sway = new Spring(0, 1.2, 0.4);
    this.glowU = { uGlowK: { value: 0.32 }, uWave: { value: -1 }, uWaveAmp: { value: 0 }, uT2: { value: 0 } };
  }

  get tricks() {
    return ['shimmer', 'bounce', 'shower'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0, 0]);
    s.bone('arc', 'root', [0, CY, 0]);
    s.bone('apex', 'arc', [0, CY + 0.2, 0]);
    s.bone('cloudL', 'root', [CX, 0.03, 0]);
    s.bone('cloudR', 'root', [-CX, 0.03, 0]);

    // each cloud's face: eyes, cheeks and a smile, found on its lumps
    this.faces = [];
    for (const side of [1, -1]) {
      const cx = CX * side;
      const cloud = side > 0 ? 'cloudL' : 'cloudR';
      const FC = fieldOf(LUMPS.map(([c, r]) => ({ type: 0, c: [cx + c[0] * side, c[1], c[2]], r: [r, r, r], k: 0.018, m: null, sub: false })));
      const eyes = [];
      for (const e of [1, -1]) {
        const p = hit(FC, [cx + e * 0.018, 0.058, 0.0], [e * 0.25, 0.08, 1]);
        const n = grad(FC, p);
        const c = [p[0] - n[0] * EYE_R * 0.42, p[1] - n[1] * EYE_R * 0.42, p[2] - n[2] * EYE_R * 0.42];
        const tag = (side > 0 ? 'L' : 'R') + (e > 0 ? 'a' : 'b');
        s.bone('eye' + tag, cloud, c);
        s.bone('lid' + tag, cloud, c);
        eyes.push({ c, dir: [e * 0.22 + side * 0.08, 0.06, 1], tag });
      }
      this.faces.push({ side, cx, cloud, FC, eyes });
    }

    const fluff = { tint: CLOUD, paint: 0.3, rough: 0.95, pat: 0, fur: 0 };
    s.setLook(fluff);
    for (const f of this.faces) {
      for (const [c, r] of LUMPS) s.sphere([f.cx + c[0] * f.side, c[1], c[2]], r, { bone: f.cloud, k: 0.018 });
      // flat underneath
      s.box([f.cx, -0.096, 0], [0.12, 0.1, 0.1], 0, { bone: f.cloud, sub: true, k: 0.012 });
      // rosy cheeks and a smile
      for (const e of [1, -1]) {
        const p = hit(f.FC, [f.cx + e * 0.03, 0.041, 0], [e * 0.4, 0, 1]);
        const n = grad(f.FC, p);
        s.sphere([p[0] - n[0] * 0.006, p[1] - n[1] * 0.006, p[2] - n[2] * 0.006], 0.0085, { bone: f.cloud, k: 0.003, tint: CHEEK, paint: 0.15, rough: 0.8 });
      }
      const smile = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = (i / (n - 1)) * 2 - 1;
        const p = hit(f.FC, [f.cx + u * 0.0135, 0.039 + 0.0065 * u * u, 0], [0, 0, 1]);
        smile.push([p[0], p[1], p[2] + 0.0015]);
      }
      s.chain(smile, smile.map((_, i) => {
        const u = (i / (n - 1)) * 2 - 1;
        return 0.0015 + 0.0026 * (1 - u * u);
      }), { bone: f.cloud, sub: true, k: 0.0016, tint: MOUTH, paint: 0, rough: 0.6 });
    }
  }

  parts(s) {
    const I = s.index;
    const q = this.q.tier === 'low' ? 0.6 : this.q.tier === 'medium' ? 0.8 : 1;

    // ---- the eyes: a pair on each cloud (addEyes only does one pair about
    // x = 0, so these are put together the same way by hand)
    const eyeMat = this.mat('eye', { iris: 0x3a7fd8, iris2: 0x6a3fc0, irisSize: 0.76, pupil: 0.45 });
    for (const f of this.faces)
      for (const e of f.eyes) {
        const g = bindTo(eyeGeometry(e.c, EYE_R, e.dir), I['eye' + e.tag]);
        const mesh = this.addMesh(g, eyeMat, { shadow: false });
        this.eyes.push({ mesh, bone: this.bonesLater('eye' + e.tag), rest: new THREE.Vector3(...e.dir).normalize(), c: new THREE.Vector3(...e.c) });
        const l = lidGeometry(e.c, EYE_R, e.dir, { tint: CLOUD, paint: 0.3, rough: 0.95 });
        bindTo(l.geometry, I['lid' + e.tag]);
        this.addMesh(l.geometry, this.hide, { shadow: false });
        this.lids.push({ bone: this.bonesLater('lid' + e.tag), axis: l.axis, open: -0.7, closed: 1.55 });
      }
    this.eyeBone = 'root';

    // ---- the bands: six soft candy ribbons, glowing gently
    const mat = this.mat('solid', { clearcoat: 0.45 });
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      base.call(mat, sh, r);
      Object.assign(sh.uniforms, this.glowU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRb;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nfloat rbA = atan(position.y - ${CY.toFixed(3)}, position.x);\nif (rbA < -1.5708) rbA += 6.28319;\nvRb = vec2(clamp(rbA, 0.0, 3.14159), 0.0);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRb;\nuniform float uGlowK, uWave, uWaveAmp, uT2;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${GLOW}`);
    };
    mat.customProgramCacheKey = () => 'mb-rainbow-glow';
    const W = (ROUT - RIN) / BANDS.length;
    const mid = (ROUT + RIN) / 2;
    BANDS.forEach((hex, i) => {
      const rc = ROUT - (i + 0.5) * W;
      const edge = Math.abs(rc - mid) / ((ROUT - RIN) / 2 + 0.006);
      const hz = 0.017 * Math.sqrt(1 - edge * edge);
      const g = bandGeometry(rc, W * 0.56, hz, Math.round(96 * q), 14);
      withLook(g, { tint: hex, paint: 0.3, rough: 0.35 });
      tintBy(g, (x, y, z, c) => c.setHex(hex));
      // the ends ride with the clouds, the top with the apex
      bindBy(g, (x, y) => {
        let th = Math.atan2(y - CY, x);
        if (th < -Math.PI / 2) th += TAU;
        th = clamp(th, 0, Math.PI);
        const wl = 1 - smooth(th / 0.55);
        const wr = 1 - smooth((Math.PI - th) / 0.55);
        const wa = Math.pow(Math.sin(th), 3);
        const rest = Math.max(0, 1 - wl - wr);
        return [[I.cloudL, wl], [I.cloudR, wr], [I.apex, wa * rest], [I.arc, (1 - wa) * rest]];
      });
      this.addMesh(g, mat, { shadow: true }).userData.region = 40 + i;
    });
  }

  // ------------------------------------------------------------ motion

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const air = this.motion.air;
    this.blinker.hold = 0;

    // up in the sky it hangs from the middle of its arch, not its feet
    // (only once settled at home: never while it comes off the canvas)
    const high = this.atHome ? 1 : 0;
    this.high = this.high === undefined ? high : lerp(this.high, high, 1 - Math.exp(-dt * 4));
    B.root.position.y -= this.high * 0.13;

    // floating: a slow bob and sway, the clouds puffing out of step
    const sw = this.sway.update(0, dt);
    B.root.position.y += Math.sin(t * 1.1) * 0.005 + Math.sin(t * 0.47) * 0.003;
    B.root.rotation.z = Math.sin(t * 0.6) * 0.025 + sw * 0.05;
    B.root.rotation.x = Math.sin(t * 0.43) * 0.02 + air * 0.1;
    const breathe = Math.sin(t * 1.6);
    for (let i = 0; i < 2; i++) {
      const b = i === 0 ? B.cloudL : B.cloudR;
      const p = this.puffs[i].update(0, dt);
      b.position.y += Math.sin(t * 1.3 + i * 1.7) * 0.003 + p * 0.03;
      const k = 1 + Math.sin(t * 1.6 + i * 2.1) * 0.018 - p * 0.4;
      b.scale.set(1 + (1 - k) * 0.6 + 0.004 * breathe, k, 1 + (1 - k) * 0.6);
      b.rotation.z = Math.sin(t * 0.9 + i * 2) * 0.03;
    }
    const fl = this.flex.update(0, dt);
    B.apex.position.y += Math.sin(t * 0.8) * 0.003 + fl * 0.03 + air * 0.01;
    B.apex.scale.setScalar(1 + fl * 0.1);

    // in the leap: the arch stretches, the clouds tuck in
    if (air > 0) {
      B.cloudL.position.x -= air * 0.012;
      B.cloudR.position.x += air * 0.012;
    }

    // tricks may send a bright wave along the bands
    this.waveAt = -1;
    this.waveAmp = 0;
    if (this.trick) this.trickPose(this.trick, dt);
    const U = this.glowU;
    U.uT2.value = t;
    U.uWave.value = this.waveAt;
    U.uWaveAmp.value = this.waveAmp;
    U.uGlowK.value = 0.32 + Math.sin(t * 1.4) * 0.04;
  }

  // a world point on the arc at a (0 at the +x foot, 1 at the -x foot)
  arcPoint(a, r = (RIN + ROUT) / 2, z = 0.02, out) {
    const th = a * Math.PI;
    const b = this.sculptor.bones[this.sculptor.index.arc].pos;
    _r[0] = Math.cos(th) * r - b[0];
    _r[1] = CY + Math.sin(th) * r - b[1];
    _r[2] = z - b[2];
    return this.bonePoint('arc', _r, out);
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'shimmer') {
      // a bright wave runs along the bands and back
      const out = clamp((t - 0.25) / 1.0, 0, 1);
      const back = clamp((t - 1.3) / 1.0, 0, 1);
      const at = t < 1.3 ? lerp(-0.15, 1.15, smooth(out)) : lerp(1.15, -0.15, smooth(back));
      const amp = bump(t, 0.2, 2.4) * 1.3;
      B.apex.position.y += Math.sin(t * 9) * 0.004 * amp;
      this.blinker.hold = amp * 0.45;
      if (!tr.a && t > 0.2) {
        tr.a = true;
        this.emit('sound', { name: 'shimmer' });
      }
      tr.sp = (tr.sp ?? 0) + dt * 5 * (amp > 0.3 ? 1 : 0);
      while (tr.sp > 1) {
        tr.sp -= 1;
        if (at > 0 && at < 1) {
          const i = Math.floor(Math.random() * 6);
          this.emit('sparkle', { at: this.arcPoint(at, ROUT - (i + 0.5) * ((ROUT - RIN) / 6), 0.03, _a), count: 9, colors: SPARK_ONE[i], speed: 0.4, up: 0.5, size: 0.016, life: 1.0 });
        }
      }
      if (!tr.b && t > 2.2) {
        tr.b = true;
        this.emit('sound', { name: 'happy' });
      }
      this.waveAt = at;
      this.waveAmp = amp;
      return;
    }
    if (tr.name === 'bounce') {
      // left cloud hops, right cloud hops, then both together
      for (const [at, dur, h, key, which, land] of HOPS) {
        const u = (t - at) / dur;
        if (u > 0 && u < 1) {
          for (const i of which) {
            const b = i === 0 ? B.cloudL : B.cloudR;
            b.position.y += 4 * u * (1 - u) * h;
            const st = Math.sin(Math.min(1, u * 1.4) * Math.PI);
            b.scale.y *= 1 + st * 0.12;
            b.scale.x *= 1 - st * 0.05;
          }
          if (which.length === 2) B.apex.position.y += 4 * u * (1 - u) * h * 1.1;
        }
        if (!tr[key] && t > at) {
          tr[key] = true;
          this.emit('sound', { name: which.length === 2 ? 'boing2' : 'boing' });
        }
        if (!tr[land] && u >= 1) {
          tr[land] = true;
          for (const i of which) this.puffs[i].kick(-2.2);
          this.flex.kick(which.length === 2 ? -2 : -0.8);
          for (const i of which) this.emit('sparkle', { at: this.bonePoint(i === 0 ? 'cloudL' : 'cloudR', [0, -0.02, 0.03]), count: 10, colors: [[2, 2, 2.1], [1.9, 1.6, 1.9]], speed: 0.5, up: 0.3, size: 0.018 });
        }
      }
      this.blinker.hold = bump(t, 1.7, 2.35) * 0.55;
      if (!tr.d && t > 1.8) {
        tr.d = true;
        this.emit('sound', { name: 'happy' });
      }
      return;
    }
    if (tr.name === 'shower') {
      // stretch the arch up tall, then shower sparkles from it
      const up = ramp(t, 0.1, 0.55) * (1 - ramp(t, 2.1, 2.6));
      B.apex.position.y += up * 0.035;
      B.apex.scale.setScalar(1 + up * 0.08);
      B.cloudL.position.x += up * 0.01;
      B.cloudR.position.x -= up * 0.01;
      this.blinker.hold = up * 0.6;
      if (!tr.a && t > 0.5) {
        tr.a = true;
        this.emit('sound', { name: 'twinkle' });
      }
      tr.sp = (tr.sp ?? 0) + dt * 5 * bump(t, 0.55, 2.1);
      while (tr.sp > 1) {
        tr.sp -= 1;
        const a = 0.08 + Math.random() * 0.84;
        const i = Math.floor(Math.random() * 6);
        const at = this.arcPoint(a, ROUT - (i + 0.5) * ((ROUT - RIN) / 6), 0.02, _b);
        this.emit('sparkle', { at, count: 18, colors: SPARK_TWO[i], speed: 0.25, up: -0.3, size: 0.02, life: 1.6 });
      }
      if (!tr.b && t > 2.2) {
        tr.b = true;
        this.flex.kick(-1);
        this.emit('sound', { name: 'happy' });
      }
      this.waveAt = 0.5;
      this.waveAmp = up * 0.5;
      return;
    }
    return undefined;
  }

  trickLength(name) {
    return { shimmer: 2.6, bounce: 2.4, shower: 2.8 }[name] || 2;
  }
}

const HOPS = [[0.2, 0.42, 0.045, 'a', [0], 'al'], [0.7, 0.42, 0.045, 'b', [1], 'bl'], [1.2, 0.55, 0.075, 'c', [0, 1], 'cl']];
const SPARK_ONE = SPARKS.map((c) => [c]);
const SPARK_TWO = SPARKS.map((c, i) => [c, SPARKS[(i + 2) % 6]]);
const _r = [0, 0, 0];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export const calls = {
  // two soft bell-bright notes, like a smile
  happy(a, t) {
    glide(a, t, [[0, 784], [0.1, 988]], { type: 'sine', v: 0.1, formant: 1300, q: 0.8 });
    glide(a, t + 0.14, [[0, 1175], [0.16, 1319]], { type: 'sine', v: 0.09, formant: 1600, q: 0.8 });
    a.bell(2637, 0.02, t + 0.3, 0.8);
  },
  // a harp glissando up and back down
  shimmer(a, t) {
    const up = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
    up.forEach((f, i) => a.bell(f, 0.035, t + i * 0.1, 0.9));
    up.slice().reverse().forEach((f, i) => a.bell(f, 0.03, t + 1.05 + i * 0.1, 0.9));
  },
  boing(a, t) {
    glide(a, t, [[0, 330], [0.06, 523], [0.3, 294]], { type: 'sine', v: 0.09, formant: 700, q: 0.8, trill: 17, trillDepth: 0.5 });
  },
  boing2(a, t) {
    glide(a, t, [[0, 262], [0.08, 440], [0.4, 220]], { type: 'sine', v: 0.1, formant: 600, q: 0.8, trill: 15, trillDepth: 0.5 });
    a.bell(1568, 0.025, t + 0.35, 0.7);
  },
  // sparkly rain
  twinkle(a, t) {
    const notes = [1319, 1568, 1760, 2093, 2349, 2637];
    for (let i = 0; i < 14; i++) a.bell(notes[(i * 5) % notes.length], 0.022, t + i * 0.1 + (i % 3) * 0.02, 0.7);
    puff(a, t, { v: 0.03, from: 3000, to: 5000, dur: 1.4 });
  },
};

// ------------------------------------------------------------ geometry

// one band of the arch: a soft pillow of a ribbon swept round a half circle
// of radius rc, half as wide as hw across, hz deep
function bandGeometry(rc, hw, hz, seg, ring) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI;
    const c = Math.cos(th), s = Math.sin(th);
    for (let j = 0; j <= ring; j++) {
      const v = (j / ring) * TAU;
      // a rounded, slightly squared cross-section
      const cv = Math.cos(v), sv = Math.sin(v);
      const rr = rc + hw * Math.sign(cv) * Math.pow(Math.abs(cv), 0.7);
      const zz = hz * Math.sign(sv) * Math.pow(Math.abs(sv), 0.8);
      pos.push(c * rr, CY + s * rr, zz);
    }
  }
  const row = ring + 1;
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < ring; j++) {
      const a = i * row + j;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const GLOW = /* glsl */ `
{
  float a = vRb.x / 3.14159265;
  float sh = 0.5 + 0.5 * sin(a * 14.0 - uT2 * 2.2);
  float wd = (a - uWave) * 5.0;
  float wave = uWaveAmp * exp(-wd * wd);
  float alive = uAliveOn > 0.5 ? vAlive : 1.0;
  totalEmissiveRadiance += diffuseColor.rgb * (uGlowK * (0.75 + 0.25 * sh) + wave * 1.6) * alive;
}`;
