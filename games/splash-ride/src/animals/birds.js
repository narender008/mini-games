// Birds over the water.
//
// 'gull':    white-and-grey gulls (wingspan about 1.3 m) circling 15-40 m up
//            on long, bent wings, gliding with the odd burst of flaps and
//            banking into their turns; now and then one drops in to follow
//            the boat for a while, calling once in a while.
// 'swallow': a few barn swallows (wingspan 33 cm) swooping low over the
//            lake at sunset: fast, twisting, flickering flaps and swept-back
//            glides, dipping to sip from the water (a tiny ring).
// 'pigeon':  a small flock of pigeons (wingspan 65 cm) wheeling at rooftop
//            height over the canal town, flapping hard with short V-winged
//            glides.
//
// Each species is one lofted body with a bill and tail and two airfoil
// wings, drawn as one InstancedMesh. The wingbeat is done in the vertex
// shader: the arm swings about the shoulder, the hand lags behind it about
// the wrist and sweeps back on the upstroke; gliding wings hold a dihedral
// (a gull's M, a pigeon's V). Plumage is painted in the fragment shader.
import * as THREE from 'three';
import { TAU, clamp, damp, rand, angleDiff } from '../config.js';
import { MeshBuilder, profiles, animalMaterial, glslColor, instanced, instanceAttr, place, headingOf } from './shared.js';

// Shapes, metres. body: [t, half width, up, down, centre y] from the forehead
// (t = 0) to the rump; wing: [x, leading edge z, trailing edge z, y] from the
// shoulder to the tip; tail: [x, front z, back z] from the middle outwards.
const SPECIES = {
  gull: {
    count: [4, 6],
    body: { z0: -0.3, len: 0.5 },
    prof: [
      [0.0, 0.015, 0.015, 0.014, 0.022],
      [0.06, 0.034, 0.034, 0.03, 0.026],
      [0.13, 0.04, 0.039, 0.035, 0.024],
      [0.21, 0.037, 0.035, 0.038, 0.012],
      [0.33, 0.06, 0.056, 0.066, 0.0],
      [0.5, 0.068, 0.064, 0.072, 0.0],
      [0.7, 0.058, 0.052, 0.056, 0.002],
      [0.88, 0.036, 0.03, 0.028, 0.006],
      [1.0, 0.017, 0.013, 0.011, 0.01],
    ],
    bill: { len: 0.058, w: 0.009, h: 0.013, hook: 0.006 },
    wing: [
      [0.02, -0.06, 0.1, 0.01],
      [0.1, -0.08, 0.13, 0.012],
      [0.2, -0.094, 0.13, 0.014],
      [0.3, -0.1, 0.108, 0.015],
      [0.4, -0.084, 0.082, 0.012],
      [0.5, -0.05, 0.08, 0.008],
      [0.58, -0.012, 0.09, 0.004],
      [0.64, 0.04, 0.108, 0.0],
      [0.675, 0.09, 0.118, 0.0],
    ],
    shoulder: 0.03,
    wrist: 0.3,
    tail: [
      [0.0, 0.14, 0.31],
      [0.035, 0.14, 0.31],
      [0.058, 0.15, 0.302],
      [0.066, 0.17, 0.29],
    ],
    paint: 0,
  },
  swallow: {
    count: [5, 7],
    body: { z0: -0.055, len: 0.11 },
    prof: [
      [0.0, 0.006, 0.006, 0.005, 0.004],
      [0.1, 0.011, 0.01, 0.009, 0.004],
      [0.25, 0.012, 0.011, 0.011, 0.002],
      [0.45, 0.013, 0.012, 0.013, 0.0],
      [0.7, 0.011, 0.01, 0.01, 0.0],
      [1.0, 0.004, 0.004, 0.003, 0.002],
    ],
    bill: { len: 0.006, w: 0.006, h: 0.004, hook: 0.0 },
    wing: [
      [0.006, -0.012, 0.022, 0.003],
      [0.03, -0.018, 0.026, 0.004],
      [0.055, -0.02, 0.02, 0.004],
      [0.08, -0.012, 0.022, 0.003],
      [0.11, 0.004, 0.032, 0.0],
      [0.14, 0.03, 0.048, -0.002],
      [0.158, 0.056, 0.064, -0.003],
    ],
    shoulder: 0.008,
    wrist: 0.055,
    tail: [
      [0.0, 0.035, 0.06],
      [0.01, 0.035, 0.075],
      [0.016, 0.04, 0.11],
      [0.019, 0.05, 0.145],
    ],
    paint: 1,
  },
  pigeon: {
    count: [7, 8],
    body: { z0: -0.13, len: 0.25 },
    prof: [
      [0.0, 0.008, 0.008, 0.007, 0.012],
      [0.07, 0.018, 0.017, 0.015, 0.014],
      [0.15, 0.02, 0.019, 0.018, 0.012],
      [0.26, 0.024, 0.022, 0.028, 0.004],
      [0.42, 0.038, 0.036, 0.042, 0.0],
      [0.62, 0.036, 0.034, 0.036, 0.002],
      [0.82, 0.024, 0.02, 0.018, 0.006],
      [1.0, 0.01, 0.008, 0.006, 0.008],
    ],
    bill: { len: 0.018, w: 0.005, h: 0.006, hook: 0.002 },
    wing: [
      [0.012, -0.035, 0.07, 0.008],
      [0.06, -0.05, 0.09, 0.009],
      [0.12, -0.058, 0.088, 0.009],
      [0.17, -0.056, 0.078, 0.007],
      [0.22, -0.042, 0.078, 0.004],
      [0.26, -0.018, 0.08, 0.0],
      [0.295, 0.012, 0.084, -0.002],
      [0.318, 0.045, 0.086, -0.003],
    ],
    shoulder: 0.015,
    wrist: 0.14,
    tail: [
      [0.0, 0.08, 0.2],
      [0.03, 0.08, 0.198],
      [0.048, 0.085, 0.19],
      [0.055, 0.1, 0.18],
    ],
    paint: 2,
  },
};

function birdGeometry(S) {
  const mb = new MeshBuilder();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const P = profiles(['w', 'up', 'dn', 'y'], S.prof);
  const { z0, len } = S.body;
  mb.loft({
    rings: 14,
    segs: 10,
    part: 0,
    cluster: 0.6,
    at: (t, o) => {
      o.y = P.y(t);
      o.z = z0 + len * t;
      o.w = P.w(t);
      o.up = P.up(t);
      o.dn = P.dn(t);
      o.e = 2;
      o.s = t;
    },
  });
  // bill: a short tapering cone from the forehead, a little hooked
  const B = S.bill;
  const by = P.y(0.02);
  mb.loft({
    rings: 5,
    segs: 6,
    part: 3,
    cluster: 0,
    at: (t, o) => {
      const u = 1 - t; // t = 0 at the tip
      o.z = z0 + 0.01 - B.len * u;
      o.y = by - 0.002 - B.hook * u * u * u;
      o.w = Math.max(0.0008, (B.w / 2) * Math.pow(t, 0.6));
      o.up = Math.max(0.0008, (B.h / 2) * Math.pow(t, 0.7));
      o.dn = o.up * 0.9;
      o.e = 2;
      o.s = t;
    },
  });
  const sOf = (x, y, z) => (z - z0) / len;
  // wings (sections from the shoulder out), mirrored
  const wn = S.wing.length;
  const wing = S.wing.map(([x, le, te, y], k) => ({ le: V(x, y, le), te: V(x, y, te), th: 0.12 - 0.08 * (k / (wn - 1)), side: V(0, 1, 0) }));
  let m = mb.mark();
  mb.fin({ sections: wing, part: 1, chord: 4, sOf });
  mb.mirrorSince(m);
  // tail: a flat fan from the middle out, mirrored
  const ty = P.y(0.95);
  const tail = S.tail.map(([x, f, b]) => ({ le: V(x, ty, f), te: V(x, ty, b), th: 0.05, side: V(0, 1, 0) }));
  m = mb.mark();
  mb.fin({ sections: tail, part: 2, chord: 3, sOf });
  mb.mirrorSince(m);
  return mb.build();
}

function birdMaterial(S, name) {
  return animalMaterial({
    name: `bird-${name}`,
    sheenTint: true,
    physical: { roughness: 0.78, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(1, 1, 1), specularIntensity: 0.3 },
    vertex: /* glsl */ `
attribute vec4 aFlap; // wingbeat phase, amplitude (rad), glide dihedral (rad), hand sweep (rad)
attribute float aSeed;
varying float vSeed;
#define B_SH ${S.shoulder.toFixed(4)}
#define B_WR ${S.wrist.toFixed(4)}
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
`,
    deform: /* glsl */ `
if (aPart > 0.5 && aPart < 1.5) {
  float sg = p.x < 0.0 ? -1.0 : 1.0;
  vec3 q = vec3(abs(p.x), p.y, p.z);
  vec3 m = vec3(n.x * sg, n.y, n.z);
  float ph = aFlap.x;
  float amp = aFlap.y;
  // the hand: lags the arm, droops in a glide, sweeps back on the upstroke
  float up = max(0.0, cos(ph));
  float hw = smoothstep(B_WR - 0.25 * B_WR, B_WR + 0.25 * B_WR, q.x);
  float a2 = hw * (amp * 0.55 * sin(ph - 0.8) - aFlap.z * 1.4);
  float sw = hw * (aFlap.w + amp * 0.45 * up);
  vec3 wr = vec3(B_WR, 0.0, 0.0);
  q = wr + rotZ(rotY(q - wr, sw), a2);
  m = rotZ(rotY(m, sw), a2);
  // the arm about the shoulder
  float aw = smoothstep(B_SH * 0.5, B_SH * 2.5, q.x);
  float a1 = aw * (aFlap.z + amp * sin(ph));
  vec3 sh = vec3(B_SH, 0.0, 0.0);
  q = sh + rotZ(q - sh, a1);
  m = rotZ(m, a1);
  p = vec3(q.x * sg, q.y, q.z);
  n = vec3(m.x * sg, m.y, m.z);
}
// the body rides the wingbeat a little
p.y -= aFlap.y * ${(S.body.len * 0.03).toFixed(4)} * sin(aFlap.x);
`,
    vertexMain: 'vSeed = aSeed;',
    fragment: /* glsl */ `
varying float vSeed;
`,
    paint: /* glsl */ `
vec3 p = vRest;
float s = vSurf.x;
float q = vSurf.y;
float k = vSurf.z;
float n1 = anNoise(p * ${S.paint === 0 ? '60.0' : S.paint === 1 ? '240.0' : '110.0'} + vSeed * 7.0);
vec3 col;
float rough = 0.78;
#if ${S.paint} == 0
  // gull: white body and tail, grey mantle and upper wings, black tips with white mirrors
  vec3 white = ${glslColor('#e9ebea')};
  vec3 grey = ${glslColor('#9ba4ad')};
  if (vPart < 0.5) {
    float mantle = smoothstep(0.35, 0.7, q) * smoothstep(0.26, 0.36, s) * (1.0 - smoothstep(0.86, 0.95, s));
    col = mix(white, grey, mantle);
    float eye = 1.0 - smoothstep(0.004, 0.0055, length(vec2(abs(p.x) - 0.026, p.y - 0.034)) + abs(p.z + 0.268) * 0.8);
    col = mix(col, vec3(0.02), eye);
  } else if (vPart < 1.5) {
    float tip = smoothstep(0.7, 0.78, k);
    float mirror = (1.0 - smoothstep(0.012, 0.02, abs(k - 0.93) * 0.3 + abs(p.z - 0.08) * 0.6)) * step(0.88, k);
    if (q > 0.0) {
      col = mix(grey, ${glslColor('#1b1c1f')}, tip);
      col = mix(col, white, mirror);
      // pale trailing edge on the arm and inner hand
      float te = smoothstep(0.0, 0.025, p.z - (0.07 + 0.05 * k)) * (1.0 - tip);
      col = mix(col, white, te * 0.8);
    } else {
      col = mix(${glslColor('#dfe2e3')}, ${glslColor('#3a3c40')}, smoothstep(0.82, 0.9, k));
    }
  } else if (vPart < 2.5) {
    col = white;
  } else {
    col = mix(${glslColor('#e0b52c')}, ${glslColor('#c9361e')}, (1.0 - smoothstep(0.004, 0.007, length(vec2(p.z + 0.3 + 0.045, p.y - 0.012)))));
    rough = 0.45;
  }
#elif ${S.paint} == 1
  // barn swallow: glossy steel blue above, rufous face, buff below, forked dark tail
  vec3 blue = ${glslColor('#1b2a4f')};
  vec3 buff = ${glslColor('#e3d3bd')};
  vec3 rufous = ${glslColor('#8e3b20')};
  if (vPart < 0.5) {
    col = mix(buff, blue, smoothstep(-0.1, 0.25, q));
    float face = (1.0 - smoothstep(0.22, 0.3, s)) * (1.0 - smoothstep(0.1, 0.4, q + 0.3 * smoothstep(0.05, 0.0, s)));
    col = mix(col, rufous, face);
    col = mix(col, blue, (1.0 - smoothstep(0.02, 0.05, abs(s - 0.3))) * step(q, 0.2));
    rough = 0.45;
  } else if (vPart < 2.5) {
    col = q > 0.0 ? blue * 0.8 : ${glslColor('#4a4b52')};
    rough = 0.5;
  } else {
    col = vec3(0.03);
  }
#else
  // feral pigeon: blue-grey, darker head, glossy green-purple neck, two black wing bars
  vec3 grey = ${glslColor('#737a86')};
  if (vPart < 0.5) {
    col = mix(grey, ${glslColor('#666d78')}, 1.0 - smoothstep(0.12, 0.2, s));
    float neck = smoothstep(0.1, 0.18, s) * (1.0 - smoothstep(0.3, 0.4, s));
    col = mix(col, mix(${glslColor('#4d7a62')}, ${glslColor('#6d4d7c')}, smoothstep(-0.3, 0.6, q)), neck * 0.8);
    col = mix(col, ${glslColor('#b8bdc4')}, smoothstep(0.75, 0.9, s) * smoothstep(0.3, 0.8, q) * 0.7);
    float eye = 1.0 - smoothstep(0.0028, 0.004, length(vec2(abs(p.x) - 0.016, p.y - 0.018)) + abs(p.z + 0.115) * 0.8);
    col = mix(col, ${glslColor('#b0441e')}, eye);
  } else if (vPart < 1.5) {
    if (q > 0.0) {
      col = mix(${glslColor('#848b96')}, ${glslColor('#3a3e46')}, smoothstep(0.62, 0.8, k));
      float bars = max(1.0 - smoothstep(0.004, 0.008, abs(p.z - 0.022)), 1.0 - smoothstep(0.004, 0.008, abs(p.z - 0.048)));
      col = mix(col, vec3(0.03), bars * (1.0 - smoothstep(0.35, 0.5, k)));
    } else {
      col = mix(${glslColor('#b9bec6')}, ${glslColor('#62676f')}, smoothstep(0.7, 0.9, k));
    }
  } else if (vPart < 2.5) {
    col = mix(grey, vec3(0.04), smoothstep(0.165, 0.175, p.z));
  } else {
    col = mix(${glslColor('#2f2b2c')}, ${glslColor('#d8d6d0')}, smoothstep(-0.126, -0.12, p.z));
  }
#endif
diffuseColor.rgb = col * (0.93 + 0.14 * n1);
anRough = rough;
`,
  });
}

// ------------------------------------------------------------ behaviour

const G = 9.81;
const _call = new THREE.Vector3();

export class Birds {
  constructor({ root, quality, world, events }, kind) {
    this.world = world;
    this.events = events;
    this.kind = SPECIES[kind] ? kind : 'gull';
    const S = SPECIES[this.kind];
    this.S = S;
    this.n = Math.round(rand(S.count[0], S.count[1] + 0.99));
    const geo = birdGeometry(S);
    this.flapAttr = instanceAttr(geo, 'aFlap', this.n, 4);
    this.seedAttr = instanceAttr(geo, 'aSeed', this.n, 1);
    this.mat = birdMaterial(S, this.kind);
    this.mesh = instanced(geo, this.mat, this.n, { shadows: false, name: `birds-${this.kind}` });
    root.add(this.mesh);
    this.list = [];
    for (let i = 0; i < this.n; i++) {
      this.list.push({
        i,
        x: 0,
        y: 20,
        z: 0,
        heading: Math.random() * TAU,
        speed: 10,
        pitch: 0,
        roll: 0,
        yawRate: 0,
        phase: Math.random() * TAU,
        amp: 0,
        dihedral: 0.1,
        sweep: 0.1,
        flapping: false,
        flapT: rand(0.5, 4),
        // gulls: a circle to ride; swallows: a point to chase
        cx: 0,
        cz: 0,
        r: rand(18, 38),
        dir: Math.random() < 0.5 ? 1 : -1,
        ang: Math.random() * TAU,
        alt: rand(15, 38),
        tx: 0,
        ty: 2,
        tz: 0,
        retarget: 0,
        follow: 0,
        dip: false,
        started: false,
        scale: rand(0.93, 1.07),
      });
      this.seedAttr.array[i] = Math.random();
    }
    this.seedAttr.needsUpdate = true;
    this.callT = rand(8, 20);
    this.followT = rand(20, 40);
    this.flock = { x: 0, z: 0, cx: 0, cz: 0, ang: 0, r: 30, alt: 11, t: 0, dir: 1, glide: 0 };
  }

  // First sight of the boat: spread the birds around it. A bird left far
  // behind comes back from behind the camera, and the flock re-gathers.
  start(b, boat) {
    const back = b.started;
    const a = back ? boat.heading + Math.PI + rand(-0.7, 0.7) : Math.random() * TAU;
    const d = back ? rand(60, 100) : rand(20, 70);
    if (back && this.kind === 'pigeon') this.flock.t = 0;
    b.cx = boat.pos.x - Math.sin(a) * d;
    b.cz = boat.pos.z - Math.cos(a) * d;
    b.x = b.cx + b.r;
    b.z = b.cz;
    if (this.kind === 'swallow') {
      b.y = rand(0.6, 3);
      b.tx = b.x;
      b.tz = b.z;
    } else if (this.kind === 'pigeon') {
      b.y = rand(9, 14);
    } else b.y = b.alt;
    b.started = true;
  }

  update(dt, time, boat) {
    const fa = this.flapAttr.array;
    if (this.kind === 'pigeon') this.updateFlock(dt, time, boat);
    this.callT -= dt;
    this.followT -= dt;
    for (const b of this.list) {
      if (!b.started || Math.hypot(b.x - boat.pos.x, b.z - boat.pos.z) > 170) this.start(b, boat);
      if (this.kind === 'gull') this.gull(b, dt, time, boat);
      else if (this.kind === 'swallow') this.swallow(b, dt, time, boat);
      else this.pigeon(b, dt, time, boat);
      place(this.mesh, b.i, b.x, b.y, b.z, b.heading, b.pitch, b.roll, b.scale);
      fa[b.i * 4] = b.phase;
      fa[b.i * 4 + 1] = b.amp;
      fa[b.i * 4 + 2] = b.dihedral;
      fa[b.i * 4 + 3] = b.sweep;
    }
    if (this.kind === 'gull' && this.callT <= 0) {
      this.callT = rand(15, 35);
      const b = this.list[Math.floor(Math.random() * this.n)];
      if (Math.hypot(b.x - boat.pos.x, b.z - boat.pos.z) < 80) this.events.sound('gull', _call.set(b.x, b.y, b.z));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.flapAttr.needsUpdate = true;
  }

  // Common flight: turn towards (vx, vz) with a turn-rate limit, bank for
  // the turn, climb or sink towards `ty`.
  fly(b, dt, vx, vz, ty, speed, maxTurn, climb) {
    const dh = angleDiff(b.heading, headingOf(vx, vz));
    const step = clamp(dh, -maxTurn * dt, maxTurn * dt);
    b.heading += step;
    b.yawRate = damp(b.yawRate, step / Math.max(dt, 1e-4), 4, dt);
    b.speed = damp(b.speed, speed, 1.5, dt);
    const vy = clamp((ty - b.y) * 0.8, -climb, climb);
    b.x -= Math.sin(b.heading) * b.speed * dt;
    b.z -= Math.cos(b.heading) * b.speed * dt;
    b.y += vy * dt;
    // bank for a coordinated turn
    b.roll = damp(b.roll, clamp(Math.atan((b.speed * b.yawRate) / G), -1.1, 1.1), 5, dt);
    b.pitch = damp(b.pitch, clamp(Math.atan2(vy, b.speed), -0.5, 0.5), 3, dt);
  }

  // Wingbeat bursts and glides.
  flap(b, dt, { freq, amp, flap, glide, dihedral, sweep, glideSweep }) {
    b.flapT -= dt;
    if (b.flapT <= 0) {
      b.flapping = !b.flapping;
      b.flapT = b.flapping ? rand(flap[0], flap[1]) : rand(glide[0], glide[1]);
    }
    b.amp = damp(b.amp, b.flapping ? amp : 0, b.flapping ? 8 : 5, dt);
    // finish the beat before settling into the glide
    const f = b.flapping || b.amp > 0.05 ? freq : 0;
    b.phase = (b.phase + TAU * f * dt) % (TAU * 1000);
    b.dihedral = damp(b.dihedral, b.flapping ? 0.05 : dihedral, 4, dt);
    b.sweep = damp(b.sweep, b.flapping ? sweep : glideSweep, 4, dt);
  }

  gull(b, dt, time, boat) {
    // circles drift after the boat, lazily
    const fx = -Math.sin(boat.heading);
    const fz = -Math.cos(boat.heading);
    if (b.follow > 0) {
      b.follow -= dt;
      const side = b.i % 2 ? 1 : -1;
      const tx = boat.pos.x - fx * 5 + Math.cos(boat.heading) * side * 3;
      const tz = boat.pos.z - fz * 5 - Math.sin(boat.heading) * side * 3;
      const ex = tx - b.x;
      const ez = tz - b.z;
      const vx = boat.vel.x + ex * 0.4;
      const vz = boat.vel.z + ez * 0.4;
      this.fly(b, dt, vx, vz, 10 + 1.5 * Math.sin(time * 0.4 + b.i), clamp(Math.hypot(vx, vz), 8, 16), 1.2, 3);
      this.flap(b, dt, { freq: 2.8, amp: 0.5, flap: [0.6, 1.2], glide: [2, 4], dihedral: 0.12, sweep: 0.05, glideSweep: 0.18 });
      if (b.follow <= 0) {
        b.cx = b.x;
        b.cz = b.z;
      }
      return;
    }
    if (this.followT <= 0 && boat.speed > 3) {
      this.followT = rand(25, 50);
      b.follow = rand(10, 18);
      return;
    }
    b.cx = damp(b.cx, boat.pos.x + fx * 25, 0.3, dt);
    b.cz = damp(b.cz, boat.pos.z + fz * 25, 0.3, dt);
    b.alt = damp(b.alt, 26 + 12 * Math.sin(time * 0.05 + b.i * 2), 0.2, dt);
    b.ang += (b.dir * 10) / b.r * dt;
    const tx = b.cx + Math.cos(b.ang + b.dir * 0.5) * b.r;
    const tz = b.cz + Math.sin(b.ang + b.dir * 0.5) * b.r;
    this.fly(b, dt, tx - b.x, tz - b.z, b.alt, 10, 0.8, 1.5);
    this.flap(b, dt, { freq: 2.6, amp: 0.48, flap: [0.8, 1.6], glide: [3, 8], dihedral: 0.12, sweep: 0.05, glideSweep: 0.2 });
  }

  swallow(b, dt, time, boat) {
    const w = this.world;
    b.retarget -= dt;
    const dx = b.tx - b.x;
    const dz = b.tz - b.z;
    if (b.retarget <= 0 || dx * dx + dz * dz < 9) {
      // a new point to swoop to, around the boat, low over the water
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * TAU;
        const r = rand(8, 45);
        const x = boat.pos.x + Math.cos(a) * r;
        const z = boat.pos.z + Math.sin(a) * r;
        if (w.depthAt(x, z) > 0.3) {
          b.tx = x;
          b.tz = z;
          break;
        }
      }
      b.dip = Math.random() < 0.18;
      b.ty = b.dip ? 0.06 : rand(0.5, 3.5);
      b.retarget = rand(1.5, 3);
    }
    let vx = b.tx - b.x;
    let vz = b.tz - b.z;
    // never too close to the boat
    const bx = b.x - boat.pos.x;
    const bz = b.z - boat.pos.z;
    const bd = Math.hypot(bx, bz);
    if (bd < 6 && bd > 1e-3) {
      vx += (bx / bd) * 30;
      vz += (bz / bd) * 30;
    }
    const surf = w.heightAt(b.x, b.z);
    this.fly(b, dt, vx, vz, surf + Math.max(b.ty, 0.06), 10 + 2 * Math.sin(time * 1.3 + b.i), 2.6, 3);
    b.y = Math.max(b.y, surf + 0.05);
    if (b.dip && b.y < surf + 0.12) {
      b.dip = false;
      b.ty = rand(1, 3);
      this.events.softRipple(b.x, b.z, 0.15);
    }
    this.flap(b, dt, { freq: 8, amp: 0.7, flap: [0.3, 0.7], glide: [0.25, 0.8], dihedral: 0.04, sweep: 0.1, glideSweep: 0.55 });
  }

  updateFlock(dt, time, boat) {
    const F = this.flock;
    F.t -= dt;
    if (F.t <= 0) {
      // wheel round a new spot near the boat
      F.t = rand(12, 20);
      const a = Math.random() * TAU;
      const d = rand(10, 45);
      F.cx = boat.pos.x + Math.cos(a) * d;
      F.cz = boat.pos.z + Math.sin(a) * d;
      F.r = rand(18, 32);
      F.dir = Math.random() < 0.5 ? 1 : -1;
      F.alt = rand(8, 15);
    }
    F.ang += (F.dir * 11) / F.r * dt;
    F.x = F.cx + Math.cos(F.ang) * F.r;
    F.z = F.cz + Math.sin(F.ang) * F.r;
    // the whole flock glides together now and then
    F.glide -= dt;
    if (F.glide < -rand(3, 6)) F.glide = rand(0.8, 1.6);
  }

  pigeon(b, dt, time, boat) {
    const F = this.flock;
    const k = b.i * 2.39996;
    const ox = Math.cos(k) * (1.5 + (b.i % 3)) + Math.sin(time * 0.3 + b.i) * 0.8;
    const oz = Math.sin(k) * (1.5 + (b.i % 3)) + Math.cos(time * 0.27 + b.i) * 0.8;
    const tx = F.x + ox;
    const tz = F.z + oz;
    // aim a little ahead along the circle so the turn stays smooth
    const lead = F.dir * 0.35;
    const lx = F.cx + Math.cos(F.ang + lead) * F.r + ox;
    const lz = F.cz + Math.sin(F.ang + lead) * F.r + oz;
    const dx = tx - b.x;
    const dz = tz - b.z;
    const catchUp = clamp(Math.hypot(dx, dz) * 0.3, 0, 5);
    this.fly(b, dt, lx - b.x, lz - b.z, F.alt + (b.i % 4) * 0.6, 11 + catchUp, 1.6, 2.5);
    const gliding = F.glide > 0;
    b.flapping = !gliding;
    b.amp = damp(b.amp, gliding ? 0 : 0.8, gliding ? 6 : 10, dt);
    b.phase = (b.phase + TAU * (b.amp > 0.05 ? 5.5 : 0) * dt) % (TAU * 1000);
    b.dihedral = damp(b.dihedral, gliding ? 0.38 : 0.08, 4, dt);
    b.sweep = damp(b.sweep, 0.08, 4, dt);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.material.dispose();
    this.mat.depth.dispose();
    this.mesh.dispose();
  }
}

export const BIRD_SPECIES = SPECIES;
