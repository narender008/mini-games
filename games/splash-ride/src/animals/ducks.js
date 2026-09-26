// Mallard families near the shore.
//
// Each family is a mother (a speckled brown female, about 55 cm) and three
// to five fluffy brown-and-yellow ducklings (about 12 cm) paddling in a line
// behind her, pottering along the shore in calm water. She pauses now and
// then and the little ones gather round; when the boat comes within about
// 12 m she leads them calmly out of its way (briskly if it is close), off to
// the side it is already on and never up the bank. Small rings trail behind
// them as they paddle, and she quacks softly once in a while.
//
// Mothers and ducklings are two InstancedMeshes built from lofted parts
// (body with a raised tail, curved neck and head, flat bill, webbed feet).
// The head turns and bobs and the feet paddle in the vertex shader; the
// fragment shader paints scalloped brown feathers with buff edges, the
// eye-stripe, the blue speculum and the orange-and-dark bill, and the
// ducklings' down.
import * as THREE from 'three';
import { TAU, clamp, damp, rand, angleDiff } from '../config.js';
import { MeshBuilder, profiles, animalMaterial, glslColor, instanced, instanceAttr, place, hide, boatFrame, awayFromLand, headingOf, keepClearOfBoat, tierOf } from './shared.js';

const MAX_KIDS = 5;

// ------------------------------------------------------------ shapes

function spineLoft(mb, { pts, prof, rings, segs, part, e = 2.1 }) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const P = profiles(['w', 'up', 'dn'], prof);
  const v = new THREE.Vector3();
  mb.loft({
    rings,
    segs,
    part,
    cluster: 0.6,
    at: (t, o) => {
      curve.getPointAt(t, v);
      o.y = v.y;
      o.z = v.z;
      o.w = P.w(t);
      o.up = P.up(t);
      o.dn = P.dn(t);
      o.e = e;
      o.s = t;
    },
  });
}

// A flat webbed foot (a thin fin), toes pointing back as it paddles.
function feet(mb, { x, y, z, len, width, part }) {
  const V = (a, b, c) => new THREE.Vector3(a, b, c);
  const sections = [
    [0.0, 0.25],
    [0.5, 0.8],
    [0.85, 1.0],
    [1.0, 0.7],
  ].map(([u, w]) => ({ le: V(x - (width * w) / 2, y - 0.004, z + u * len), te: V(x + (width * w) / 2, y - 0.004, z + u * len), th: 0.12, side: V(0, 1, 0) }));
  const m = mb.mark();
  mb.fin({ sections, part, chord: 3, sOf: () => 0 });
  mb.mirrorSince(m);
}

const MOTHER = {
  body: [
    [0.0, 0.03, 0.03, 0.03, 0.02],
    [0.06, 0.07, 0.062, 0.058, 0.02],
    [0.18, 0.1, 0.076, 0.072, 0.02],
    [0.35, 0.112, 0.082, 0.074, 0.02],
    [0.55, 0.108, 0.078, 0.068, 0.025],
    [0.72, 0.09, 0.066, 0.054, 0.034],
    [0.85, 0.06, 0.046, 0.034, 0.05],
    [0.94, 0.034, 0.024, 0.018, 0.066],
    [1.0, 0.014, 0.008, 0.006, 0.078],
  ],
  z0: -0.2,
  len: 0.45,
  neck: [
    [0, 0.172, -0.262],
    [0, 0.178, -0.225],
    [0, 0.166, -0.192],
    [0, 0.12, -0.17],
    [0, 0.07, -0.14],
  ],
  neckProf: [
    [0.0, 0.02, 0.02, 0.017],
    [0.12, 0.031, 0.036, 0.03],
    [0.3, 0.036, 0.04, 0.035],
    [0.5, 0.036, 0.036, 0.038],
    [0.7, 0.042, 0.036, 0.044],
    [1.0, 0.055, 0.05, 0.055],
  ],
  bill: { base: [0, 0.168, -0.252], tip: [0, 0.154, -0.312], w: [0.0145, 0.0135], h: [0.026, 0.01] },
  foot: { x: 0.045, y: -0.075, z: 0.04, len: 0.05, width: 0.045 },
  neckPivot: [0, 0.09, -0.14],
};

const KID = {
  body: [
    [0.0, 0.012, 0.012, 0.012, 0.018],
    [0.15, 0.03, 0.028, 0.025, 0.02],
    [0.45, 0.038, 0.034, 0.03, 0.02],
    [0.75, 0.032, 0.028, 0.024, 0.024],
    [0.92, 0.02, 0.016, 0.012, 0.03],
    [1.0, 0.008, 0.006, 0.006, 0.034],
  ],
  z0: -0.045,
  len: 0.105,
  neck: [
    [0, 0.06, -0.066],
    [0, 0.064, -0.043],
    [0, 0.052, -0.026],
    [0, 0.03, -0.018],
  ],
  neckProf: [
    [0.0, 0.012, 0.012, 0.011],
    [0.2, 0.021, 0.022, 0.019],
    [0.45, 0.023, 0.024, 0.022],
    [0.75, 0.02, 0.02, 0.02],
    [1.0, 0.022, 0.022, 0.022],
  ],
  bill: { base: [0, 0.057, -0.062], tip: [0, 0.053, -0.077], w: [0.0065, 0.0056], h: [0.007, 0.003] },
  foot: { x: 0.013, y: -0.012, z: 0.012, len: 0.016, width: 0.014 },
  neckPivot: [0, 0.03, -0.02],
};

function duckGeometry(S, tier, kid) {
  const mb = new MeshBuilder();
  const hi = tier !== 'low';
  const P = profiles(['w', 'up', 'dn', 'y'], S.body);
  mb.loft({
    rings: kid ? (hi ? 12 : 9) : hi ? 24 : 16,
    segs: kid ? (hi ? 12 : 10) : hi ? 20 : 14,
    part: 0,
    cluster: 0.6,
    at: (t, o) => {
      o.y = P.y(t);
      o.z = S.z0 + S.len * t;
      o.w = P.w(t);
      o.up = P.up(t);
      o.dn = P.dn(t);
      o.e = 2.2;
      o.e2 = 2.6;
      o.s = t;
    },
  });
  spineLoft(mb, { pts: S.neck, prof: S.neckProf, rings: kid ? 10 : hi ? 18 : 12, segs: kid ? 12 : hi ? 14 : 10, part: 1 });
  // bill: flat and broad, a rounded tip
  const b = S.bill;
  const bw = profiles(['w', 'h'], [
    [0.0, b.w[1] * 0.55, b.h[1] * 0.6],
    [0.12, b.w[1], b.h[1]],
    [0.6, (b.w[0] + b.w[1]) / 2, (b.h[0] + b.h[1]) / 2],
    [1.0, b.w[0], b.h[0]],
  ]);
  mb.loft({
    rings: 6,
    segs: 10,
    part: 3,
    cluster: 0.4,
    at: (t, o) => {
      // t = 0 at the tip
      o.z = b.tip[2] + (b.base[2] - b.tip[2]) * t;
      o.y = b.tip[1] + (b.base[1] - b.tip[1]) * t;
      o.w = bw.w(t);
      o.up = bw.h(t) * 0.55;
      o.dn = bw.h(t) * 0.45;
      o.e = 2.6;
      o.e2 = 2.6;
      o.s = t;
    },
  });
  feet(mb, { ...S.foot, part: 4 });
  return mb.build();
}

const v3 = (a) => `vec3(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;

// Shared vertex code: the head turns and bobs about the neck, feet paddle.
function duckVertex(S) {
  return /* glsl */ `
attribute vec4 aDuck; // paddle phase, head yaw, head pitch (down +), seed
varying float vSeed;
const vec3 D_NECK = ${v3(S.neckPivot)};
const vec3 D_FOOT = vec3(${S.foot.x.toFixed(4)}, ${S.foot.y.toFixed(4)}, ${S.foot.z.toFixed(4)});
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
`;
}

const DUCK_DEFORM = /* glsl */ `
if (aPart > 0.5 && aPart < 3.5) {
  // neck and head: a smooth weight up the neck
  float w = smoothstep(D_NECK.y, D_NECK.y + 0.6 * (0.0 - D_NECK.z) + 0.02, p.y);
  float bob = sin(aDuck.x) * 0.06;
  vec3 r = p - D_NECK;
  r = rotY(rotX(r, -(aDuck.z + bob) * w), aDuck.y * w);
  n = rotY(rotX(n, -(aDuck.z + bob) * w), aDuck.y * w);
  p = D_NECK + r;
} else if (aPart > 3.5) {
  // webbed feet paddle, left and right in turn
  float sg = p.x < 0.0 ? -1.0 : 1.0;
  vec3 piv = vec3(D_FOOT.x * sg, D_FOOT.y + 0.01, D_FOOT.z);
  float a = 0.7 * sin(aDuck.x + (sg > 0.0 ? 0.0 : 3.1416));
  p = piv + rotX(p - piv, a);
  n = rotX(n, a);
}
`;

function motherMaterial() {
  return animalMaterial({
    name: 'mallard',
    sheenTint: true,
    bump: true,
    physical: { roughness: 0.78, sheen: 0.45, sheenRoughness: 0.55, sheenColor: new THREE.Color(1, 1, 1), specularIntensity: 0.35 },
    vertex: duckVertex(MOTHER),
    deform: DUCK_DEFORM,
    vertexMain: 'vSeed = aDuck.w;',
    fragment: /* glsl */ `
varying float vSeed;
const vec3 M_DARK = ${glslColor('#553b26')};
const vec3 M_BUFF = ${glslColor('#c29560')};
const vec3 M_PALE = ${glslColor('#cfb187')};
const vec3 M_EYE = vec3(0.032, 0.186, -0.232);
// Scalloped feathers lying like roof tiles, tips pointing back: each is
// dark brown with a buff fringe round its rounded tip. uv.x runs along the
// body (to the tail), uv.y across. Returns the fringe (1 on the buff edge).
float feather(vec2 uv, vec2 size, out float id) {
  vec2 g = uv / size;
  float row = floor(g.y);
  g.x += 0.5 * mod(row, 2.0);
  vec2 c = floor(g);
  vec2 f = fract(g);
  id = anHash2(c);
  float across = f.y * 2.0 - 1.0;
  float wob = anNoise(vec3(uv * 180.0, id * 9.0)) - 0.5;
  float tip = 0.9 - (0.4 + 0.25 * id) * across * across + (id - 0.5) * 0.18 + wob * 0.12;
  float edge = tip - f.x;
  float width = 0.08 + 0.12 * anHash2(c + 3.3);
  float fringe = smoothstep(-0.02, 0.03, edge) * (1.0 - smoothstep(width, width + 0.1, edge));
  // a pale mark down the middle of some feathers
  fringe = max(fringe, (1.0 - smoothstep(0.04, 0.1, abs(across))) * smoothstep(0.25, 0.5, edge) * (1.0 - smoothstep(0.5, 0.75, edge)) * step(0.55, id) * 0.6);
  return fringe;
}
`,
    paint: /* glsl */ `
vec3 p = vRest;
float s = vSurf.x;
float q = vSurf.y;
vec3 an = abs(vRestN);
float n1 = anNoise(p * 90.0 + vSeed * 5.0);
vec3 col;
if (vPart < 0.5) {
  vec2 uv = an.y > an.x * 1.2 ? vec2(p.z, p.x) : vec2(p.z, p.y);
  float fine = 1.0 - smoothstep(0.15, 0.3, s);
  float id;
  float f = feather(uv, mix(vec2(0.026, 0.02), vec2(0.014, 0.011), fine), id);
  col = mix(M_DARK * (0.8 + 0.4 * id), M_BUFF * (0.85 + 0.25 * anHash2(vec2(id, 1.7))), f * 0.8);
  col = mix(col, col * 0.8, smoothstep(0.55, 0.9, q) * 0.8);
  col = mix(col, M_PALE, fine * 0.35);
  // the belly (mostly under water) is paler and plainer
  col = mix(col, M_PALE * (0.9 + 0.2 * n1), smoothstep(-0.2, -0.6, q));
  // folded wing: speculum (blue bordered white) towards the rear of the side
  float wing = smoothstep(0.15, 0.3, q) * smoothstep(0.3, 0.4, s) * (1.0 - smoothstep(0.86, 0.93, s));
  float spec = (1.0 - smoothstep(0.03, 0.05, abs(s - 0.72))) * (1.0 - smoothstep(0.06, 0.1, abs(q - 0.42)));
  float border = (1.0 - smoothstep(0.004, 0.012, abs(abs(s - 0.72) - 0.055))) * (1.0 - smoothstep(0.08, 0.12, abs(q - 0.42)));
  col = mix(col, col * 0.85, wing * 0.4);
  col = mix(col, ${glslColor('#2b3f99')}, spec * 0.9);
  col = mix(col, ${glslColor('#e8e6e0')}, border * 0.85);
  anSheen = 1.0 + spec * 2.0;
  // pale outer tail feathers
  col = mix(col, ${glslColor('#d8c7a4')}, smoothstep(0.9, 0.97, s) * 0.8);
  anBump = f * 0.0012 + n1 * 0.0004;
} else if (vPart < 1.5) {
  // head and neck: fine brown streaks, dark crown and eye-stripe, buff face
  float streak = anNoise(vec3(p.x * 420.0, p.y * 420.0, p.z * 60.0)) * 0.6 + anNoise(p * 150.0) * 0.4;
  col = mix(${glslColor('#b8915f')}, ${glslColor('#5a4130')}, smoothstep(0.3, 0.8, streak) * 0.6);
  // the lower neck blends into the breast
  col = mix(col, mix(M_BUFF, M_DARK, 0.45), smoothstep(0.7, 0.95, s) * 0.7);
  col = mix(col, M_DARK, smoothstep(0.45, 0.8, q) * step(0.13, p.y));
  float stripeY = 0.186 - (p.z + 0.232) * 0.3;
  float stripe = (1.0 - smoothstep(0.004, 0.008, abs(p.y - stripeY))) * step(-0.265, p.z) * step(p.z, -0.18) * step(0.012, abs(p.x));
  col = mix(col, M_DARK, stripe * 0.9);
  col = mix(col, ${glslColor('#d2b28a')}, smoothstep(-0.2, -0.7, q) * step(0.14, p.y) * 0.6);
  float de = length(vec3(abs(p.x), p.y, p.z) - M_EYE);
  float eye = 1.0 - smoothstep(0.0045, 0.006, de);
  col = mix(col, vec3(0.02, 0.012, 0.008), eye);
  anRough = mix(anRough, 0.1, eye);
  anSheen = 1.0 - eye;
  anBump = streak * 0.0004;
} else if (vPart < 3.5) {
  // bill: orange with a dark saddle, darker nail at the tip
  float saddle = smoothstep(0.35, 0.65, anNoise(p * 160.0)) * smoothstep(0.1, 0.6, q) * smoothstep(0.1, 0.4, s) * (1.0 - smoothstep(0.85, 1.0, s));
  col = mix(${glslColor('#d9782c')}, ${glslColor('#3a2a21')}, saddle * 0.9);
  col = mix(col, ${glslColor('#2e2420')}, (1.0 - smoothstep(0.04, 0.1, s)) * 0.7);
  anRough = 0.45;
  anSheen = 0.0;
} else {
  col = ${glslColor('#d8782e')};
  anRough = 0.5;
  anSheen = 0.0;
}
diffuseColor.rgb = col * (0.92 + 0.14 * n1) * (0.94 + 0.12 * vSeed);
`,
  });
}

function kidMaterial() {
  return animalMaterial({
    name: 'duckling',
    sheenTint: true,
    bump: true,
    physical: { roughness: 0.92, sheen: 1, sheenRoughness: 0.75, sheenColor: new THREE.Color(1, 1, 1), specularIntensity: 0.2 },
    vertex: duckVertex(KID),
    deform: DUCK_DEFORM,
    vertexMain: 'vSeed = aDuck.w;',
    fragment: /* glsl */ `
varying float vSeed;
const vec3 K_DARK = ${glslColor('#3a2a1a')};
const vec3 K_YEL = ${glslColor('#e3c25a')};
const vec3 K_EYE = vec3(0.0185, 0.067, -0.05);
`,
    paint: /* glsl */ `
vec3 p = vRest;
float s = vSurf.x;
float q = vSurf.y;
float fuzz = anNoise(p * 900.0 + vSeed * 13.0);
float n1 = anNoise(p * 160.0 + vSeed * 3.0);
vec3 col;
if (vPart < 0.5) {
  // dark back, yellow below, yellow spots on the wing buds and the rump
  col = mix(K_YEL, K_DARK, smoothstep(0.05, 0.4, q + (n1 - 0.5) * 0.25));
  float spot1 = 1.0 - smoothstep(0.006, 0.011, length(vec2(abs(p.x) - 0.03, p.z - 0.0)) + abs(p.y - 0.035) * 0.3);
  float spot2 = 1.0 - smoothstep(0.005, 0.01, length(vec2(abs(p.x) - 0.018, p.z - 0.042)) + abs(p.y - 0.04) * 0.3);
  col = mix(col, K_YEL, max(spot1, spot2) * step(0.1, q));
} else if (vPart < 1.5) {
  // yellow face, dark crown and a dark stripe through the eye
  col = mix(K_YEL, K_DARK, smoothstep(0.5, 0.75, q) * step(0.055, p.y));
  float stripe = (1.0 - smoothstep(0.0025, 0.0045, abs(p.y - (0.067 - (p.z + 0.062) * 0.2)))) * step(-0.062, p.z) * step(0.008, abs(p.x));
  col = mix(col, K_DARK, stripe);
  col = mix(col, K_DARK, smoothstep(0.02, 0.05, p.z + 0.05) * smoothstep(0.3, 0.6, q) * step(0.04, p.y));
  float de = length(vec3(abs(p.x), p.y, p.z) - K_EYE);
  float eye = 1.0 - smoothstep(0.0028, 0.0038, de);
  col = mix(col, vec3(0.015), eye);
  anRough = mix(anRough, 0.1, eye);
  anSheen = 1.0 - eye;
} else if (vPart < 3.5) {
  col = mix(${glslColor('#4d423f')}, ${glslColor('#b7948a')}, 1.0 - smoothstep(0.0, 0.2, s));
  anRough = 0.5;
  anSheen = 0.0;
} else {
  col = ${glslColor('#7a6a4a')};
  anSheen = 0.0;
}
diffuseColor.rgb = col * (0.85 + 0.3 * fuzz);
anBump = fuzz * 0.00035;
`,
  });
}

// ------------------------------------------------------------ behaviour

const _fr = { along: 0, across: 0 };
const _g = { x: 0, z: 0 };
const _v = new THREE.Vector3();

function duck(scale) {
  return { x: 0, z: 0, heading: 0, speed: 0, vx: 0, vz: 0, phase: Math.random() * TAU, headYaw: 0, headPitch: 0, lookT: rand(1, 4), lookTo: 0, scale, seed: Math.random(), rippleT: rand(0, 1.5) };
}

export class Ducks {
  constructor({ root, quality, world, events }, families) {
    this.world = world;
    this.events = events;
    const tier = tierOf(quality);
    const nf = clamp(Math.round(families), 1, 4);
    this.families = [];
    for (let f = 0; f < nf; f++) {
      const kids = [];
      const nk = Math.floor(rand(3, 5.99));
      for (let k = 0; k < nk; k++) kids.push(duck(rand(0.9, 1.08)));
      this.families.push({ mother: duck(rand(0.95, 1.05)), kids, dir: Math.random() < 0.5 ? 1 : -1, pause: 0, walkT: rand(4, 10), quackT: rand(6, 20), g: { x: 0, z: 0 }, gT: 0, ld: 5, flee: 0 });
    }
    this.nKids = nf * MAX_KIDS;
    const mg = duckGeometry(MOTHER, tier, false);
    const kg = duckGeometry(KID, tier, true);
    this.mAttr = instanceAttr(mg, 'aDuck', nf, 4);
    this.kAttr = instanceAttr(kg, 'aDuck', this.nKids, 4);
    this.mMat = motherMaterial();
    this.kMat = kidMaterial();
    const shadows = quality?.shadows !== false && tier !== 'low';
    this.mothers = instanced(mg, this.mMat, nf, { shadows, name: 'ducks' });
    this.kidsMesh = instanced(kg, this.kMat, this.nKids, { shadows, name: 'ducklings' });
    root.add(this.mothers, this.kidsMesh);
    this.placeFamilies();
  }

  // Calm spots a few metres off the shore, well apart.
  placeFamilies() {
    const w = this.world;
    const b = w.bounds;
    const spots = [];
    for (let k = 0; k < 900 && spots.length < this.families.length; k++) {
      const x = rand(b.minX, b.maxX);
      const z = rand(b.minZ, b.maxZ);
      const ld = w.landDistance(x, z);
      if (ld < 3 || ld > 9 || w.depthAt(x, z) < 0.25) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 30)) continue;
      spots.push({ x, z });
    }
    this.families.forEach((f, i) => {
      const s = spots[i] || spots[0] || { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
      const m = f.mother;
      m.x = s.x;
      m.z = s.z;
      awayFromLand(w, s.x, s.z, _g);
      m.heading = headingOf(-_g.z * f.dir, _g.x * f.dir);
      f.kids.forEach((k, j) => {
        k.x = m.x + Math.sin(m.heading) * 0.3 * (j + 1);
        k.z = m.z + Math.cos(m.heading) * 0.3 * (j + 1);
        k.heading = m.heading;
      });
    });
  }

  update(dt, time, boat) {
    const w = this.world;
    const ma = this.mAttr.array;
    const ka = this.kAttr.array;
    for (let fi = 0; fi < this.families.length; fi++) {
      const f = this.families[fi];
      const m = f.mother;
      // the shore: distance every frame, direction now and then
      f.ld = w.landDistance(m.x, m.z);
      f.gT -= dt;
      if (f.gT <= 0) {
        f.gT = 0.5;
        awayFromLand(w, m.x, m.z, f.g);
      }
      const g = f.g;
      const bx = m.x - boat.pos.x;
      const bz = m.z - boat.pos.z;
      const bd = Math.hypot(bx, bz);
      const near = bd < 12;
      // along the shore, nudged back into the 3-10 m band, with a meander
      let dx = -g.z * f.dir;
      let dz = g.x * f.dir;
      const band = f.ld < 3 ? 1 : f.ld > 10 ? -1 : 0;
      dx += g.x * band * 0.8;
      dz += g.z * band * 0.8;
      const wig = Math.sin(time * 0.23 + fi * 3) * 0.5;
      let hx = dx * Math.cos(wig) - dz * Math.sin(wig);
      let hz = dx * Math.sin(wig) + dz * Math.cos(wig);
      let speed = 0.26;
      f.walkT -= dt;
      if (f.walkT <= 0) {
        if (f.pause > 0) f.pause = 0;
        else f.pause = rand(3, 7);
        f.walkT = f.pause > 0 ? f.pause : rand(6, 14);
        if (Math.random() < 0.25) f.dir = -f.dir;
      }
      if (f.pause > 0) speed = 0.04;
      if (near && bd > 1e-3) {
        // out of the boat's way: sideways off its line, and away from it
        boatFrame(boat, m.x, m.z, _fr);
        const side = _fr.across >= 0 ? 1 : -1;
        const sx = Math.cos(boat.heading) * side;
        const sz = -Math.sin(boat.heading) * side;
        hx = sx * 1.2 + bx / bd;
        hz = sz * 1.2 + bz / bd;
        // never up the bank: slide along it instead
        const into = hx * g.x + hz * g.z;
        if (f.ld < 3 && into < 0) {
          hx -= g.x * into;
          hz -= g.z * into;
        }
        const closing = _fr.along > 0 && _fr.along < 10 && boat.speed > 2;
        speed = closing && bd < 7 ? 1.6 : 0.8;
        if (f.flee <= 0) {
          f.flee = 1;
          if (speed > 1) this.events.sound('duck', _v.set(m.x, 0.3, m.z));
        }
        f.pause = 0;
      } else f.flee = 0;
      this.move(m, dt, hx, hz, speed, 3, 0.8);
      this.keepOut(m, boat);
      // quack now and then, softly
      f.quackT -= dt;
      if (f.quackT <= 0) {
        f.quackT = rand(14, 35);
        if (bd < 60) this.events.sound('duck', _v.set(m.x, 0.3, m.z));
      }
      // ducklings: a line behind her, a huddle when she stops
      let lead = m;
      for (let j = 0; j < f.kids.length; j++) {
        const k = f.kids[j];
        let tx;
        let tz;
        if (f.pause > 0 && !near) {
          const a = j * 2.1 + time * 0.2;
          tx = m.x + Math.cos(a) * (0.35 + 0.1 * (j % 2));
          tz = m.z + Math.sin(a) * (0.35 + 0.1 * (j % 2));
        } else {
          const gap = lead === m ? 0.34 : near ? 0.17 : 0.22;
          const wob = Math.sin(time * 1.7 + j * 2.3) * 0.06;
          tx = lead.x + Math.sin(lead.heading) * gap + Math.cos(lead.heading) * wob;
          tz = lead.z + Math.cos(lead.heading) * gap - Math.sin(lead.heading) * wob;
        }
        const ex = tx - k.x;
        const ez = tz - k.z;
        const d = Math.hypot(ex, ez);
        const sp = clamp(d * 3, 0, near ? 2.2 : 0.8);
        if (d > 0.02) this.move(k, dt, ex, ez, sp, 7, 4);
        else this.move(k, dt, -Math.sin(k.heading), -Math.cos(k.heading), 0, 7, 4);
        this.keepOut(k, boat);
        lead = k;
      }
      // write
      this.pose(m, dt, time, bd);
      const surf = w.heightAt(m.x, m.z);
      // tilt with the swell: sample the surface ahead and to the side
      const hf = w.heightAt(m.x - Math.sin(m.heading) * 0.25, m.z - Math.cos(m.heading) * 0.25);
      const hr = w.heightAt(m.x + Math.cos(m.heading) * 0.25, m.z - Math.sin(m.heading) * 0.25);
      place(this.mothers, fi, m.x, surf, m.z, m.heading, Math.atan2(hf - surf, 0.25), -Math.atan2(hr - surf, 0.25), m.scale);
      ma[fi * 4] = m.phase;
      ma[fi * 4 + 1] = m.headYaw;
      ma[fi * 4 + 2] = m.headPitch;
      ma[fi * 4 + 3] = m.seed;
      this.ripples(m, dt, bd, m.speed > 0.6 ? 1.2 : 2.4, 0.14);
      for (let j = 0; j < MAX_KIDS; j++) {
        const i = fi * MAX_KIDS + j;
        const k = f.kids[j];
        if (!k) {
          hide(this.kidsMesh, i);
          continue;
        }
        this.pose(k, dt, time, bd);
        place(this.kidsMesh, i, k.x, w.heightAt(k.x, k.z), k.z, k.heading, 0, 0, k.scale);
        ka[i * 4] = k.phase;
        ka[i * 4 + 1] = k.headYaw;
        ka[i * 4 + 2] = k.headPitch;
        ka[i * 4 + 3] = k.seed;
        if (k.speed > 0.6) this.ripples(k, dt, bd, 2.6, 0.07);
      }
    }
    this.mothers.instanceMatrix.needsUpdate = true;
    this.kidsMesh.instanceMatrix.needsUpdate = true;
    this.mAttr.needsUpdate = true;
    this.kAttr.needsUpdate = true;
  }

  // Paddle towards (dx, dz) at `speed`, turning at most `turn` rad/s.
  move(d, dt, dx, dz, speed, turn, accel) {
    if (dx * dx + dz * dz > 1e-8) {
      const dh = angleDiff(d.heading, headingOf(dx, dz));
      d.heading += clamp(dh, -turn * dt, turn * dt);
      // slow down while turning hard
      speed *= 1 - 0.6 * Math.min(1, Math.abs(dh) / 1.5);
    }
    const acc = accel * dt * (speed > d.speed ? 1 : 1.5);
    d.speed += clamp(speed - d.speed, -acc, acc);
    const nx = d.x - Math.sin(d.heading) * d.speed * dt;
    const nz = d.z - Math.cos(d.heading) * d.speed * dt;
    // stay on the water
    if (this.world.depthAt(nx, nz) > 0.08) {
      d.x = nx;
      d.z = nz;
    } else d.speed = 0;
  }

  keepOut(d, boat) {
    _v.set(d.x, 0, d.z);
    if (keepClearOfBoat(boat, _v, 0.6) && this.world.depthAt(_v.x, _v.z) > 0.08) {
      d.x = _v.x;
      d.z = _v.z;
    }
  }

  // Paddling rhythm and a head that looks about.
  pose(d, dt, time, bd) {
    d.phase = (d.phase + TAU * (1.2 + d.speed * 4) * dt) % (TAU * 1000);
    d.lookT -= dt;
    if (d.lookT <= 0) {
      d.lookT = rand(1.2, 4);
      d.lookTo = Math.random() < 0.4 ? 0 : rand(-0.7, 0.7);
    }
    d.headYaw = damp(d.headYaw, d.lookTo, 5, dt);
    d.headPitch = damp(d.headPitch, d.speed > 0.6 ? -0.08 : 0, 3, dt);
  }

  // Little rings behind a paddling duck (only near the boat, where they show;
  // the ducklings add theirs only when hurrying).
  ripples(d, dt, bd, every, strength) {
    if (bd > 40 || d.speed < 0.15) return;
    d.rippleT -= dt;
    if (d.rippleT > 0) return;
    d.rippleT = every * rand(0.8, 1.2);
    const back = 0.18 * d.scale;
    this.events.softRipple(d.x + Math.sin(d.heading) * back, d.z + Math.cos(d.heading) * back, clamp(strength * (0.6 + d.speed), 0.04, 0.35));
  }

  dispose() {
    for (const [mesh, mat] of [
      [this.mothers, this.mMat],
      [this.kidsMesh, this.kMat],
    ]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.material.dispose();
      mat.depth.dispose();
      mesh.dispose();
    }
  }
}
