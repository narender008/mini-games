// Songbirds for the garden: a handful of round, big-eyed little birds (think
// robin, blue tit, sparrow) that fly across the sky in gentle arcs, land on
// the lawn, the lantern posts, the light strings, the studio beam and the
// bushes, hop and peck, tilt their heads, preen and sing, and take off when
// a friend runs close or a finger comes near, then come back later.
//
// One InstancedMesh draws them all. The geometry is a single bird whose
// parts are posed in the vertex shader from per-bird numbers (wing flap,
// wing bend, wing fold, head turn, beak, tail, legs, breath, blink), so the
// wings really flap (a fast downstroke, a folding upstroke, the tips
// trailing), the head follows what the bird looks at and the beak opens on
// each note of its song. Bird colours are three per-bird tints (back,
// belly, breast) painted through weights in the geometry.
//
// Behaviour is a small state machine per bird: perched (idle acts), crouch,
// flight along a Bezier path (arriving from off-screen, hopping to another
// perch, or leaving), landing with a flare, and away (out of sight for a
// while). Paths are planned relative to the camera so a fly-by really
// crosses the picture.
import * as THREE from 'three';
import { rng, rand, pick, clamp, damp, angleDiff, TAU, REDUCED_MOTION } from '../config.js';
import { makeSong, makePeep, VOICES } from '../sound/ambient.js';
import { POND, POSTS, groundAt, walkable } from './world.js';

const MAX_BIRDS = 6;
const SIZE = 1.25; // birds are a little bigger than life: cute, and easy to see
const FOOT = 0.064; // body centre to sole, legs fully out (model metres)

// ------------------------------------------------------------ kinds

const K = { body: 0, head: 1, wing: 2, tail: 3, leg: 4, jaw: 5, eye: 6 };

// three tints each (back, belly, breast); beak and legs are shared
const SPECIES = [
  { name: 'robin', back: 0x8b6a4b, belly: 0xf3e8d4, breast: 0xe8662d, size: 1.0 },
  { name: 'bluetit', back: 0x5c90e2, belly: 0xf7dc55, breast: 0xfff1b0, size: 0.92 },
  { name: 'sparrow', back: 0xa4703f, belly: 0xece0cb, breast: 0x6d5646, size: 0.98 },
  { name: 'bluebird', back: 0x4a86ea, belly: 0xf6efe6, breast: 0xdb8a4e, size: 1.04 },
  { name: 'canary', back: 0xf3ca48, belly: 0xfff0a6, breast: 0xf7a83c, size: 0.94 },
  { name: 'rosefinch', back: 0xc97a86, belly: 0xf7e9e4, breast: 0xf294ad, size: 1.0 },
];

const col = (hex) => new THREE.Color(hex);

// ------------------------------------------------------------ geometry

function accumulator() {
  return { pos: [], nor: [], fix: [], tint: [], part: [], idx: [] };
}

// append a geometry: fn(x, y, z, nx, ny, nz) -> { fix, tint, span, gloss }
function addGeometry(acc, geo, kind, fn) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const base = acc.pos.length / 3;
  for (let i = 0; i < p.count; i++) {
    const o = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    acc.pos.push(p.getX(i), p.getY(i), p.getZ(i));
    acc.nor.push(n.getX(i), n.getY(i), n.getZ(i));
    acc.fix.push(...(o.fix || [0, 0, 0]));
    acc.tint.push(...(o.tint || [0, 0, 0]));
    acc.part.push(kind, o.span || 0, o.gloss || 0, 0);
  }
  if (geo.index) for (let i = 0; i < geo.index.count; i++) acc.idx.push(base + geo.index.getX(i));
  else for (let i = 0; i < p.count; i++) acc.idx.push(base + i);
}

const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// an ellipsoid with proper normals: centre c, radii r
function ellipsoid(acc, c, r, kind, fn, w = 22, h = 16) {
  const g = new THREE.SphereGeometry(1, w, h);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);
    const nx = ux / r[0], ny = uy / r[1], nz = uz / r[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(i, nx / l, ny / l, nz / l);
    p.setXYZ(i, c[0] + ux * r[0], c[1] + uy * r[1], c[2] + uz * r[2]);
  }
  addGeometry(acc, g, kind, fn);
}

// a thin curved sheet (a wing, the tail): fn(u, v) -> [x, y, z]. Two skins,
// a lighter one underneath, so the edge is never see-through.
function sheet(acc, nu, nv, fn, kind, topFn, botFn, thick = 0.0012, mirror = false) {
  for (const side of [1, -1]) {
    const pos = [];
    const idx = [];
    for (let i = 0; i <= nu; i++)
      for (let j = 0; j <= nv; j++) {
        const [x, y, z] = fn(i / nu, j / nv);
        pos.push(mirror ? -x : x, y + side * thick, z);
      }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j;
        const b = (i + 1) * (nv + 1) + j;
        const c = a + 1;
        const d = b + 1;
        // the top skin faces up; mirroring the wing flips its winding
        const up = (side > 0) !== mirror;
        if (up) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    // (the sheet is smooth, so a normal needs no fixing beyond winding, but keep them unit)
    let k = 0;
    const fnv = side > 0 ? topFn : botFn;
    addGeometry(acc, g, kind, (x, y, z) => {
      const i = Math.floor(k / (nv + 1));
      const j = k % (nv + 1);
      k++;
      return fnv(i / nu, j / nv, nrm);
    });
  }
}

const SHOULDER = [0.03, 0.014, 0.014];

function buildGeometry() {
  const acc = accumulator();
  const beak = col(0xdc9a4c);
  const beakDark = col(0xc4823c);
  const leg = col(0x9c6d50);
  const eye = col(0x0b0706);
  // body: a plump egg, back tint above, breast tint at the front, belly below
  ellipsoid(acc, [0, 0, -0.003], [0.037, 0.039, 0.051], K.body, (x, y, z, nx, ny, nz) => {
    const top = smooth(-0.3, 0.3, ny);
    const chest = smooth(0.0, 0.55, nz) * (1 - top) * smooth(0.95, 0.35, Math.abs(nx));
    return { tint: [top, (1 - top) * (1 - chest), chest] };
  });
  // head: a round ball with the crown in the back tint and the face in the breast tint
  ellipsoid(acc, [0, 0.038, 0.046], [0.03, 0.029, 0.031], K.head, (x, y, z, nx, ny, nz) => {
    const top = smooth(-0.15, 0.45, ny) * smooth(0.75, 0.35, nz);
    const face = smooth(0.2, 0.7, nz) * (1 - top);
    return { tint: [top, (1 - top) * (1 - face) * 0.85, face] };
  });
  // beak: a small cone in two halves
  const cone = (r, len, y, z, flat, color, kind) => {
    const g = new THREE.ConeGeometry(r, len, 12, 1);
    g.rotateX(Math.PI / 2);
    g.scale(1, flat, 1);
    g.translate(0, y, z);
    addGeometry(acc, g, kind, () => ({ fix: [color.r, color.g, color.b] }));
  };
  cone(0.0078, 0.02, 0.0355, 0.0865, 0.78, beak, K.head);
  cone(0.0066, 0.0155, 0.0303, 0.0785, 0.7, beakDark, K.jaw);
  // eyes: big, glossy, dark, each with a catchlight
  for (const s of [-1, 1]) {
    ellipsoid(acc, [s * 0.0215, 0.0425, 0.0575], [0.0098, 0.0104, 0.0098], K.eye, () => ({ fix: [eye.r, eye.g, eye.b], gloss: 1 }), 14, 10);
    ellipsoid(acc, [s * 0.0236, 0.0475, 0.0636], [0.0029, 0.0029, 0.0029], K.eye, () => ({ fix: [2.6, 2.5, 2.3], gloss: 0.4 }), 8, 6);
    ellipsoid(acc, [s * 0.0186, 0.0412, 0.0644], [0.0014, 0.0014, 0.0014], K.eye, () => ({ fix: [1.6, 1.6, 1.5], gloss: 0.4 }), 6, 5);
  }
  // legs and little feet
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.003, 0.0026, 0.036, 6, 1);
    g.translate(s * 0.0135, -0.044, -0.004);
    addGeometry(acc, g, K.leg, () => ({ fix: [leg.r, leg.g, leg.b] }));
    ellipsoid(acc, [s * 0.0135, -0.0625, 0.002], [0.0055, 0.0022, 0.0105], K.leg, () => ({ fix: [leg.r, leg.g, leg.b] }), 8, 6);
  }
  // wings: two of them, mirrored. u along the span, v across the chord.
  const wing = (u, v) => {
    const x = SHOULDER[0] + 0.108 * u;
    // broad at the root, rounded, ending in a soft point; the leading edge sweeps back
    const chord = 0.066 * Math.pow(Math.max(0, 1 - Math.pow(u, 2.6)), 0.55) + 0.005 * (1 - u);
    const le = SHOULDER[2] + 0.01 - 0.04 * u * u;
    let z = le - v * chord;
    if (v > 0.99) z -= 0.006 * Math.abs(Math.sin(u * u * 11 + 0.4)) * u * (1 - u * 0.5);
    const y = SHOULDER[1] + 0.007 * Math.sin(v * Math.PI) * (1 - 0.6 * u) - 0.012 * u * u;
    return [x, y, z];
  };
  const wingTop = (u, v) => {
    const fringe = smooth(0.7, 1, v);
    const w = (0.95 - 0.36 * u * u) * (1 - fringe * 0.55);
    return { tint: [w, fringe * 0.32, 0], span: u };
  };
  const wingBot = (u, v) => ({ tint: [0.12, 0.85, 0], span: u });
  for (const mirror of [false, true]) sheet(acc, 12, 3, wing, K.wing, wingTop, wingBot, 0.0012, mirror);
  // tail: a tapered blade
  const tail = (u, v) => {
    const len = 0.052;
    const z = -0.036 - u * len;
    // a fan that widens and ends in a rounded tip
    const round = u > 0.78 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.78) / 0.22, 2))) : 1;
    const half = (0.009 + 0.017 * Math.min(1, u * 1.3)) * round;
    return [(0.5 - v) * 2 * half, 0.004 - 0.003 * u, z];
  };
  sheet(acc, 8, 2, tail, K.tail, (u) => ({ tint: [0.78 - 0.25 * u, 0, 0] }), (u) => ({ tint: [0.2, 0.6, 0] }), 0.0026, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
  g.setAttribute('aFix', new THREE.Float32BufferAttribute(acc.fix, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(acc.tint, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(acc.part, 4));
  g.setIndex(acc.idx);
  return g;
}

// ------------------------------------------------------------ material

const VERT_DECL = /* glsl */ `
attribute vec3 aFix;
attribute vec3 aTint;
attribute vec4 aPart;   // kind, span, gloss
attribute vec4 aPose;   // wing flap, wing bend, wing fold, wing retract
attribute vec4 aLook;   // head yaw, pitch, roll, tail pitch
attribute vec4 aExtra;  // beak open, leg extension, breath puff, blink
attribute vec4 aMore;   // tail spread
uniform vec3 uTints[${MAX_BIRDS * 3}]; // per bird: back, belly, breast
varying vec3 vBird;
varying float vGloss;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
`;

// pose the part this vertex belongs to; sets bp (position) and bn (normal)
const POSE = /* glsl */ `
vec3 bp = position;
vec3 bn = objectNormal;
float kind = aPart.x;
if (kind < 0.5) {
  bp *= 1.0 + aExtra.z * 0.075;
} else if (kind < 1.5 || (kind > 4.5 && kind < 6.5)) {
  vec3 pivot = vec3(0.0, 0.022, 0.034);
  if (kind > 5.5) bp.y = 0.0425 + (bp.y - 0.0425) * (1.0 - aExtra.w * 0.9);
  if (kind > 4.5 && kind < 5.5) {
    vec3 jaw = vec3(0.0, 0.0315, 0.070);
    mat3 J = rotX(aExtra.x * 0.55);
    bp = jaw + J * (bp - jaw);
    bn = J * bn;
  }
  mat3 H = rotY(aLook.x) * rotX(aLook.y) * rotZ(aLook.z);
  bp = pivot + H * (bp - pivot);
  bn = H * bn;
} else if (kind < 2.5) {
  float side = position.x > 0.0 ? 1.0 : -1.0;
  vec3 sh = vec3(side * 0.03, 0.014, 0.014);
  float f = aPose.z;
  // folded, the wing rides up on the back, narrower, its tip sweeping back and a little down
  vec3 tuck = vec3(side * 0.012, -0.002, 0.0) * f;
  vec3 wl = vec3((position.x - sh.x) * side, position.y - sh.y, (position.z - sh.z) * (1.0 - 0.4 * f));
  vec3 nl = vec3(bn.x * side, bn.y, bn.z);
  float u = aPart.y;
  // pulled in on the upstroke
  wl.x *= 1.0 - 0.32 * aPose.w - 0.05 * f;
  mat3 W = rotZ(aPose.x + aPose.y * u * u);
  wl = W * wl;
  nl = W * nl;
  mat3 F = rotX(-f * 0.12) * rotZ(-f * 0.95) * rotY(f * 1.5);
  wl = F * wl;
  nl = F * nl;
  bp = sh + tuck + vec3(wl.x * side, wl.y, wl.z);
  bn = vec3(nl.x * side, nl.y, nl.z);
} else if (kind < 3.5) {
  vec3 pv = vec3(0.0, 0.004, -0.036);
  float fan = -(position.z + 0.036) / 0.052;
  vec3 tp = position - pv;
  tp.x *= 1.0 + aMore.x * (0.5 + fan * 1.5);
  mat3 T = rotX(aLook.w);
  bp = pv + T * tp;
  bn = T * bn;
} else if (kind < 4.5) {
  bp.y = -0.026 + (position.y + 0.026) * aExtra.y;
  bp.z += (1.0 - aExtra.y) * 0.004;
}
`;

function makeMaterial(tints) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.66, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffe9cc) });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTints = { value: tints };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${POSE}\nobjectNormal = normalize(bn);`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = bp;\nvBird = aFix + uTints[gl_InstanceID * 3] * aTint.x + uTints[gl_InstanceID * 3 + 1] * aTint.y + uTints[gl_InstanceID * 3 + 2] * aTint.z;\nvGloss = aPart.z;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBird;\nvarying float vGloss;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vBird;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, vGloss);');
  };
  return mat;
}

// ------------------------------------------------------------ the flock

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _bez = Array.from({ length: 8 }, () => new THREE.Vector3());

// a point of a Bezier curve of any degree up to 6 (De Casteljau, no allocation)
function bezier(pts, u, out) {
  const n = pts.length;
  for (let i = 0; i < n; i++) _bez[i].copy(pts[i]);
  for (let k = 1; k < n; k++) for (let i = 0; i < n - k; i++) _bez[i].lerp(_bez[i + 1], u);
  return out.copy(_bez[0]);
}

// the wing's cycle at phase u (0..1): a quick downstroke, a slower upstroke
// with the wing drawn in. Returns the flap in -1 (down) .. 1 (up).
function flapAt(u) {
  if (u < 0.42) return Math.cos((u / 0.42) * Math.PI);
  return -Math.cos(((u - 0.42) / 0.58) * Math.PI);
}
const retractAt = (u) => (u < 0.42 ? 0 : Math.sin(((u - 0.42) / 0.58) * Math.PI));

const _up = new THREE.Vector3(0, 1, 0);

export class Birds {
  // world: the World (light strings, bushes); sound(): the Ambient, or null while the audio is locked
  constructor({ scene, quality, world, sound }) {
    this.scene = scene;
    this.world = world;
    this.sound = sound;
    const n = quality.tier === 'low' ? 3 : quality.tier === 'medium' ? 4 : 5;
    this.n = n;
    this.calm = REDUCED_MOTION.matches;
    const geo = buildGeometry();
    const attr = (size, name, dyn = true) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
      if (dyn) a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.aPose = attr(4, 'aPose');
    this.aLook = attr(4, 'aLook');
    this.aExtra = attr(4, 'aExtra');
    this.aMore = attr(4, 'aMore');
    this.tints = Array.from({ length: MAX_BIRDS * 3 }, () => new THREE.Color());
    this.mesh = new THREE.InstancedMesh(geo, makeMaterial(this.tints), n);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // a soft blob of shadow on the ground under each bird
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ color: 0x0b1204, transparent: true, opacity: 0.34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    sm.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBlob;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlob = uv * 2.0 - 1.0;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vBlob;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= smoothstep(1.0, 0.05, length(vBlob));');
    };
    this.shadows = new THREE.InstancedMesh(sg, sm, n);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    scene.add(this.shadows);
    this.spots = this.makeSpots();
    const R = rng(4242);
    this.list = [];
    for (let i = 0; i < n; i++) this.list.push(this.makeBird(i, SPECIES[i % SPECIES.length], R));
    this.threats = [];
    this.lastState = '';
    this.gardenState = 'menu';
    this.camera = null;
    for (const b of this.list) this.write(b);
    this.upload();
  }

  // ------------------------------------------------------------ perches

  makeSpots() {
    const w = this.world;
    const spots = [];
    // lantern posts: on the little ring at the top of the lantern
    for (const [x, z] of POSTS) spots.push({ kind: 'post', x, y: 1.05 + 0.245, z, yaw: Math.PI * 0.5, owner: null });
    // light strings: on the wire, across it
    for (const [A, B] of w.spans.slice(0, 3)) {
      const a = new THREE.Vector3(...A);
      const b = new THREE.Vector3(...B);
      for (const t of [0.34, 0.5, 0.66]) {
        const p = a.clone().lerp(b, t);
        const along = Math.atan2(b.x - a.x, b.z - a.z);
        spots.push({ kind: 'wire', x: p.x, y: this.wireY(a, b, t), z: p.z, yaw: along + Math.PI / 2, along, a, b, owner: null });
      }
    }
    // the studio's front beam
    for (const x of [-2.1, -1.3, -0.5, 0.6, 1.4, 2.2]) spots.push({ kind: 'beam', x, y: 2.83, z: -0.95, yaw: Math.PI / 2, along: Math.PI / 2, owner: null });
    // bush tops
    for (const b of w.bushes) spots.push({ kind: 'bush', x: b.x, y: b.r * 1.42, z: b.z, yaw: 0, owner: null });
    // the pond's rim: a bird by the water, looking in
    for (const a of [0.9, 2.2, 3.4, 4.6, 5.6]) {
      const x = POND.x + Math.cos(a) * (POND.r + 0.3);
      const z = POND.z + Math.sin(a) * (POND.r + 0.3);
      spots.push({ kind: 'rim', x, y: groundAt(x, z) + 0.012, z, yaw: Math.atan2(POND.x - x, POND.z - z), owner: null });
    }
    return spots;
  }

  // the height of a light string at t (0..1) along it, as it sags
  wireY(a, b, t) {
    return a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * this.world.stringSag * a.distanceTo(b) * 0.25;
  }

  // a spot on the lawn, away from friends, the pond and the trees
  lawnSpot(near = null, self = null) {
    let any = null;
    for (let i = 0; i < 24; i++) {
      let x, z;
      if (near && Math.random() < 0.6) {
        x = near.x + rand(-1.4, 1.4);
        z = near.z + rand(-1.2, 1.2);
      } else {
        x = rand(-3.6, 3.4);
        z = rand(-6.2, -1.1);
      }
      if (z > -1.1 || walkable(x, z) > -0.25 || !this.clear(x, z, 0.5, self)) continue;
      const y = groundAt(x, z) + 0.012;
      const spot = { kind: 'lawn', x, y, z, yaw: rand(-Math.PI, Math.PI), owner: null, temp: true };
      // the garden camera looks at a small part of the lawn: land there when it can
      if (!this.camera || this.inView(x, y, z, this.camera)) return spot;
      any = any || spot;
    }
    return any;
  }

  // nobody (friend, finger or another bird) close to a point on the ground
  clear(x, z, r, self = null) {
    for (const t of this.threats) if (Math.hypot(x - t.x, z - t.z) < r + t.r) return false;
    for (const b of this.list) if (b !== self && b.state !== 'away' && b.pos.y < 0.5 && Math.hypot(x - b.pos.x, z - b.pos.z) < 0.3) return false;
    return true;
  }

  inView(x, y, z, camera) {
    _v.set(x, y, z).project(camera);
    return _v.z < 1 && Math.abs(_v.x) < 0.92 && Math.abs(_v.y) < 0.9;
  }

  // choose where to land: a free perch, preferably in view, clear of threats
  pickSpot(b, camera, from = null) {
    const cands = [];
    let sum = 0;
    const add = (s, w) => {
      if (camera && this.inView(s.x, s.y, s.z, camera)) w *= 5;
      cands.push([s, w]);
      sum += w;
    };
    for (const s of this.spots) {
      if (s.owner && s.owner !== b) continue;
      if (b.spot === s) continue;
      if (s.y < 0.6 && !this.clear(s.x, s.z, 0.45, b)) continue;
      if (from && Math.hypot(s.x - from.x, s.z - from.z) < 1.6) continue;
      add(s, { post: 1, wire: 1.6, beam: 0.8, bush: 1.1, rim: 0.9 }[s.kind] ?? 1);
    }
    // most small birds are on the ground
    const lawn = this.lawnSpot(from ? null : b.pos, b);
    if (lawn && (!from || Math.hypot(lawn.x - from.x, lawn.z - from.z) > 1.6)) add(lawn, 3.2);
    if (!cands.length) return null;
    let r = Math.random() * sum;
    for (const [s, w] of cands) {
      r -= w;
      if (r <= 0) return s;
    }
    return cands[0][0];
  }

  // ------------------------------------------------------------ birds

  makeBird(i, spec, R) {
    this.tints[i * 3].set(spec.back);
    this.tints[i * 3 + 1].set(spec.belly);
    this.tints[i * 3 + 2].set(spec.breast);
    return {
      i,
      spec,
      voice: VOICES[i % VOICES.length],
      size: SIZE * spec.size * (0.94 + R() * 0.14),
      pos: new THREE.Vector3(0, -50, 0),
      surf: new THREE.Vector3(),
      yaw: 0, tilt: 0.1, roll: 0, yawRate: 0,
      state: 'away',
      timer: 1.5 + i * 2.6 + R() * 2,
      spot: null, path: null, plan: null,
      act: 'still', actT: 0, actD: 1, stay: 0, scared: 0, cool: 0, viewT: 0, seen: true,
      // the pose that goes to the shader
      flap: 0.1, bend: 0, fold: 1, retract: 0,
      hy: 0, hp: 0, hr: 0, tailP: 0, tailS: 0,
      beak: 0, legs: 1, puff: 0, blink: 0, hopY: 0, crouch: 0, fade: 1,
      // what the head is turning to
      thy: 0, thp: 0, thr: 0,
      phase: R(),
      fm: 'flap', fmT: 0, flapPhase: 0, prevFlap: 0, bob: 0, launchT: 0,
      blinkT: 1 + R() * 3, blinkA: 0,
      song: null, songT: 0, sang: false,
      hop: null,
      visible: false,
    };
  }

  // ------------------------------------------------------------ update

  // friends: [{ pos, radius, speed }], pointer: a point on the ground or null
  update(dt, t, { camera, friends, pointer, state }) {
    const th = this.threats;
    th.length = 0;
    for (const f of friends) th.push({ x: f.pos.x, z: f.pos.z, r: (f.radius || 0.15) * 0.9 + 0.2 + Math.min(f.speed || 0, 0.9) * 0.8, finger: false });
    if (pointer) th.push({ x: pointer.x, z: pointer.z, r: 0.42, finger: true });
    const inGarden = state === 'play' || state === 'magic';
    const entered = inGarden && this.lastState !== 'play' && this.lastState !== 'magic';
    this.lastState = state;
    this.gardenState = state;
    this.camera = camera;
    let active = 0;
    for (const b of this.list) if (b.state !== 'away') active++;
    for (const b of this.list) {
      // arriving in the garden: the birds come to see, one after another
      if (entered && b.state === 'away') b.timer = Math.min(b.timer, 0.8 + b.i * 2.2);
      this.step(b, dt, t, camera, state);
    }
    // never leave the garden empty for long
    if (inGarden && active < 2) {
      const gone = this.list.filter((b) => b.state === 'away').sort((a, b) => a.timer - b.timer)[0];
      if (gone && gone.timer > 3) gone.timer = rand(1, 3);
    }
    this.upload();
  }

  step(b, dt, t, camera, state) {
    b.actT += dt;
    b.cool = Math.max(0, b.cool - dt);
    b.scared = Math.max(0, b.scared - dt);
    if (b.state === 'away') {
      b.visible = false;
      b.timer -= dt;
      // not while a child paints: the garden stays calm behind the easel
      if (b.timer <= 0) {
        if (state === 'paint') b.timer = 1;
        else this.arrive(b, camera);
      }
      this.write(b);
      return;
    }
    b.visible = true;
    b.blinkT -= dt;
    if (b.blinkT <= 0) {
      b.blinkA = 0.17;
      b.blinkT = rand(2, 5.5);
    }
    b.blinkA = Math.max(0, b.blinkA - dt);
    b.blink = b.blinkA > 0 ? Math.sin((1 - b.blinkA / 0.17) * Math.PI) : 0;
    this.songStep(b, dt);
    if (b.state === 'idle') this.idle(b, dt, t, camera);
    else if (b.state === 'crouch') this.crouch(b, dt, camera);
    else if (b.state === 'fly') this.fly(b, dt, t, camera);
    else if (b.state === 'settle') this.settle(b, dt);
    this.headStep(b, dt);
    this.write(b);
  }

  // ------------------------------------------------------------ singing

  // begin a song (or a peep); the beak and the sound both follow the same notes
  startSong(b, peep = false) {
    const s = this.sound?.();
    if (s && !s.canSing()) return false;
    const song = peep ? makePeep(b.voice.base) : makeSong(b.voice.kind, b.voice.base);
    s?.sing(song, b.pos.x, b.pos.y, b.pos.z, this.gardenState === 'paint' ? 0.5 : 1);
    b.song = song;
    b.songT = 0;
    return true;
  }

  songStep(b, dt) {
    if (!b.song) {
      b.beak = damp(b.beak, 0, 30, dt);
      return;
    }
    b.songT += dt;
    let open = 0;
    for (const n of b.song.notes) {
      const k = (b.songT - n.t) / n.d;
      if (k >= 0 && k <= 1) open = Math.max(open, Math.sin(Math.min(1, k * 1.1) * Math.PI) * n.v);
    }
    b.beak = damp(b.beak, open, 45, dt);
    b.puff = damp(b.puff, 0.15 + open * 0.8, 16, dt);
    if (b.songT > b.song.length + 0.12) b.song = null;
  }

  // ------------------------------------------------------------ perched

  // settle on a perch and begin to look about
  land(b, spot) {
    b.spot = spot;
    if (!spot.temp) spot.owner = b;
    b.surf.set(spot.x, spot.y, spot.z);
    b.state = 'idle';
    b.roll = 0;
    b.tilt = this.perchTilt(spot);
    b.stay = spot.kind === 'lawn' ? rand(7, 16) : rand(10, 24);
    this.newAct(b, 'still');
  }

  perchTilt(spot) {
    return spot.kind === 'lawn' ? 0.12 : spot.kind === 'rim' ? 0.16 : 0.42;
  }

  leaveSpot(b) {
    if (b.spot && !b.spot.temp && b.spot.owner === b) b.spot.owner = null;
  }

  newAct(b, act) {
    b.act = act;
    b.actT = 0;
    b.hop = null;
    b.sang = false;
    const s = b.spot;
    switch (act) {
      case 'still': b.actD = rand(0.7, 2.2); break;
      case 'look': b.actD = rand(0.8, 1.8); b.thy = rand(-1.1, 1.1); b.thp = rand(-0.3, 0.15); break;
      case 'tilt': b.actD = rand(0.9, 1.6); b.thr = pick([-1, 1]) * rand(0.35, 0.6); b.thy = rand(-0.7, 0.7); b.thp = rand(-0.3, -0.1); break;
      case 'peck': b.actD = rand(1.0, 1.9); b.thy = rand(-0.3, 0.3); break;
      case 'drink': b.actD = rand(1.4, 2.4); b.thy = 0; break;
      case 'preen': b.actD = rand(1.2, 2.0); b.thy = pick([-1, 1]) * rand(1.6, 2.1); b.thp = rand(0.25, 0.5); break;
      case 'sing': b.actD = rand(1.6, 2.4); b.thp = -0.35; b.thy = rand(-0.5, 0.5); break;
      case 'fluff': b.actD = 0.7; break;
      case 'hop': {
        b.hop = this.hopTarget(b, s.kind === 'lawn' || s.kind === 'rim');
        if (!b.hop) return this.newAct(b, 'look');
        b.actD = 0.34;
        b.hop.from = b.surf.clone();
        break;
      }
      default: b.actD = 1;
    }
  }

  // where a small hop goes: over the lawn, or a shuffle along the wire or beam
  hopTarget(b, lawn) {
    const s = b.spot;
    if (lawn) {
      const ang = b.yaw + rand(-1.2, 1.2) + (Math.random() < 0.25 ? Math.PI : 0);
      const d = rand(0.08, 0.2);
      const x = b.surf.x + Math.sin(ang) * d;
      const z = b.surf.z + Math.cos(ang) * d;
      if (walkable(x, z) > -0.15 || Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.15 || !this.clear(x, z, 0.3, b)) return null;
      return { x, z, y: groundAt(x, z) + 0.012, yaw: Math.atan2(x - b.surf.x, z - b.surf.z) };
    }
    if ((s.kind === 'wire' || s.kind === 'beam') && s.along !== undefined) {
      const d = rand(0.06, 0.14) * pick([-1, 1]);
      const x = b.surf.x + Math.sin(s.along) * d;
      const z = b.surf.z + Math.cos(s.along) * d;
      if (s.kind === 'beam') return Math.abs(x) > 2.4 ? null : { x, z, y: b.surf.y, yaw: b.yaw };
      const dx = s.b.x - s.a.x;
      const dz = s.b.z - s.a.z;
      const t = ((x - s.a.x) * dx + (z - s.a.z) * dz) / (dx * dx + dz * dz);
      if (t < 0.1 || t > 0.9) return null;
      return { x, z, y: this.wireY(s.a, s.b, t), yaw: b.yaw };
    }
    return null;
  }

  idle(b, dt, t, camera) {
    const s = b.spot;
    const lawn = s.kind === 'lawn' || s.kind === 'rim';
    // the wings rest folded, the legs out, the tail easy
    b.roll = damp(b.roll, 0, 8, dt);
    b.fold = damp(b.fold, 1, 12, dt);
    b.flap = damp(b.flap, 0.1, 12, dt);
    b.bend = damp(b.bend, 0, 12, dt);
    b.retract = damp(b.retract, 0, 12, dt);
    b.tailS = damp(b.tailS, 0, 8, dt);
    b.legs = damp(b.legs, 1, 14, dt);
    b.crouch = damp(b.crouch, 0, 10, dt);
    b.fade = 1;
    // a friend or a finger too close: off
    if (b.scared <= 0) {
      const th = this.threatNear(b);
      if (th) return this.startle(b, th);
    }
    let tilt = this.perchTilt(s);
    let tail = 0.05 * Math.sin(t * 1.3 + b.phase * 9);
    let hopY = 0;
    let puff = 0.03 * Math.sin(t * 2.2 + b.phase * 5);
    const k = clamp(b.actT / b.actD, 0, 1);
    // a bird out of the picture moves on sooner, to somewhere the child can see it
    b.viewT -= dt;
    if (b.viewT <= 0) {
      b.viewT = 0.6;
      b.seen = !camera || this.inView(b.pos.x, b.pos.y, b.pos.z, camera);
    }
    b.stay -= b.seen ? dt : dt * 2.5;
    switch (b.act) {
      case 'still':
        b.thy = Math.sin(t * 0.7 + b.phase * 8) * 0.12;
        b.thp = Math.sin(t * 0.5 + b.phase * 3) * 0.05;
        b.thr = 0;
        break;
      case 'look':
        b.thr = 0;
        break;
      case 'peck': {
        // quick pecks at the ground: head down, tail up, body tipping forward
        const dip = Math.max(0, Math.sin(((b.actT * 2.4) % 1) * Math.PI * 1.15)) ** 1.3;
        b.thp = 0.95 * dip - 0.05;
        b.thr = 0;
        tilt = 0.12 - 0.36 * dip;
        tail = 0.3 * dip;
        break;
      }
      case 'drink': {
        const dip = Math.max(0, Math.sin(((b.actT * 1.4) % 1) * Math.PI)) ** 1.5;
        b.thp = 0.8 * dip;
        b.thr = 0;
        tilt = 0.16 - 0.3 * dip;
        break;
      }
      case 'preen':
        b.thp = 0.42 + 0.08 * Math.sin(b.actT * 14);
        b.thr = 0.25;
        break;
      case 'sing':
        if (!b.sang && b.actT > 0.35) {
          b.sang = true;
          if (this.startSong(b)) b.actD = b.actT + b.song.length + 0.5;
          else b.actD = b.actT + 0.3;
        }
        b.thr = 0;
        tilt = 0.5;
        break;
      case 'fluff': {
        const e = Math.sin(k * Math.PI);
        puff = 0.9 * e;
        b.thp = 0.05 * Math.sin(b.actT * 40) * e;
        b.thr = 0;
        break;
      }
      case 'hop': {
        // a little jump: spring, arc, land
        const h = b.hop;
        const u = k;
        b.surf.set(h.from.x + (h.x - h.from.x) * u, h.from.y + (h.y - h.from.y) * u, h.from.z + (h.z - h.from.z) * u);
        const arc = Math.sin(u * Math.PI);
        hopY = arc * (lawn ? 0.05 : 0.035);
        b.yaw += angleDiff(b.yaw, h.yaw) * (1 - Math.exp(-14 * dt));
        b.legs = 1 + arc * 0.14;
        b.flap = damp(b.flap, 0.1 + 0.5 * arc, 20, dt);
        b.fold = damp(b.fold, 1 - 0.45 * arc, 20, dt);
        tilt = 0.12 + 0.3 * arc;
        tail = 0.25 * arc;
        b.thp = -0.15 * arc;
        b.thr = 0;
        break;
      }
    }
    b.tilt = damp(b.tilt, tilt, 12, dt);
    b.tailP = damp(b.tailP, tail, 9, dt);
    b.hopY = damp(b.hopY, hopY, 30, dt);
    if (!b.song) b.puff = damp(b.puff, puff, 10, dt);
    b.hr = damp(b.hr, b.thr, 7, dt);
    if (b.actT >= b.actD) this.nextAct(b);
    if (b.stay <= 0 && b.act !== 'sing' && b.state === 'idle') this.takeOff(b, camera, null, Math.random() < 0.35);
    if (b.state === 'idle') b.pos.set(b.surf.x, b.surf.y + FOOT * b.size + b.hopY, b.surf.z);
  }

  nextAct(b) {
    const s = b.spot;
    const lawn = s.kind === 'lawn' || s.kind === 'rim';
    if (b.act === 'hop') {
      b.surf.set(b.hop.x, b.hop.y, b.hop.z);
      // hops come in twos and threes
      if (Math.random() < 0.55) return this.newAct(b, 'hop');
    }
    const r = Math.random();
    let act;
    if (lawn) {
      act = r < 0.3 ? 'peck' : r < 0.55 ? 'hop' : r < 0.7 ? 'look' : r < 0.8 ? 'tilt' : r < 0.86 ? 'preen' : r < 0.9 ? 'fluff' : 'still';
      if (s.kind === 'rim' && r < 0.5) act = 'drink';
    } else {
      act = r < 0.3 ? 'sing' : r < 0.46 ? 'look' : r < 0.6 ? 'tilt' : r < 0.72 ? 'preen' : r < 0.8 ? 'hop' : r < 0.86 ? 'fluff' : 'still';
    }
    if (act === 'sing') {
      if (b.cool > 0 || (this.calm && Math.random() < 0.5)) act = 'look';
      else b.cool = rand(6, 12);
    }
    this.newAct(b, act);
  }

  threatNear(b) {
    // a bird up on a wire or a beam does not mind a friend far below
    const high = b.spot.y > 0.9;
    for (const t of this.threats) {
      const d = Math.hypot(b.pos.x - t.x, b.pos.z - t.z);
      if (high && (t.finger || d > 0.6)) continue;
      if (d < t.r) return t;
    }
    return null;
  }

  startle(b, th) {
    b.scared = 2;
    this.takeOff(b, this.camera, th, Math.random() < 0.4);
    if (Math.random() < 0.5) this.startSong(b, true);
  }

  // ------------------------------------------------------------ take-off and landing

  takeOff(b, camera, from, away = false) {
    this.leaveSpot(b);
    b.plan = { spot: away ? null : this.pickSpot(b, camera, from), from };
    b.state = 'crouch';
    b.actT = 0;
    b.act = 'crouch';
    b.thp = -0.15;
    b.thy = 0;
    b.thr = 0;
    b.song = null;
  }

  crouch(b, dt, camera) {
    // a quick squat, a look ahead, then up
    const d = this.calm ? 0.24 : 0.13;
    const k = clamp(b.actT / d, 0, 1);
    b.crouch = k;
    b.tilt = damp(b.tilt, 0.05, 16, dt);
    b.legs = 1 - 0.25 * k;
    b.fold = damp(b.fold, 0.55, 20, dt);
    b.flap = damp(b.flap, 0.5, 20, dt);
    b.pos.set(b.surf.x, b.surf.y + FOOT * b.size * (1 - 0.12 * k), b.surf.z);
    if (b.actT >= d) this.launch(b, camera);
  }

  launch(b, camera) {
    const { spot } = b.plan;
    const a = b.pos.clone();
    const pts = spot ? this.hopPath(b, a, spot) : this.exitPath(a, camera);
    b.path = { pts, u: 0, len: this.pathLength(pts), spot, age: 0 };
    b.state = 'fly';
    b.fm = 'flap';
    b.fmT = rand(0.6, 0.9);
    b.flapPhase = 0;
    b.bob = 0;
    b.launchT = 0;
    b.fade = 1;
    if (spot) spot.owner = spot.temp ? null : b;
    this.sound?.()?.flutter(b.pos.x, b.pos.y, b.pos.z, 1);
  }

  hopPath(b, a, spot) {
    const B = new THREE.Vector3(spot.x, spot.y + FOOT * b.size, spot.z);
    const d = a.distanceTo(B);
    const dir = new THREE.Vector3().copy(B).sub(a).setY(0).normalize();
    const P1 = a.clone().addScaledVector(dir, Math.min(0.5, d * 0.25));
    P1.y = a.y + 0.55 + Math.min(0.9, d * 0.18);
    const P2 = B.clone().addScaledVector(dir, -Math.min(0.9, d * 0.32));
    P2.y = B.y + Math.min(0.6, 0.18 + d * 0.06);
    return [a, P1, P2, B];
  }

  // off, out of the picture: to the side, up and away
  exitPath(a, camera) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();
    const side = Math.random() < 0.5 ? -1 : 1;
    const E = a.clone().addScaledVector(fwd, rand(2, 5)).addScaledVector(right, side * rand(6, 9));
    E.y = rand(2.6, 4.2);
    const P1 = a.clone().addScaledVector(fwd, 0.6).addScaledVector(right, side * 1.2);
    P1.y = a.y + rand(0.8, 1.4);
    const P2 = a.clone().lerp(E, 0.6);
    P2.y = Math.max(P1.y + 0.5, rand(1.8, 3));
    return [a, P1, P2, E];
  }

  pathLength(pts) {
    let len = 0;
    bezier(pts, 0, _v);
    for (let i = 1; i <= 16; i++) {
      bezier(pts, i / 16, _w);
      len += _v.distanceTo(_w);
      _v.copy(_w);
    }
    return Math.max(0.2, len);
  }

  // out of sight for a while, then back in across the picture, to land
  arrive(b, camera) {
    const spot = this.pickSpot(b, camera, null);
    if (!spot) {
      b.timer = 2;
      return;
    }
    // a lane across the camera's view, a few metres out, with a gentle arc
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();
    const hf = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const side = Math.random() < 0.5 ? -1 : 1;
    const d = rand(3.2, 6);
    const half = Math.tan(hf) * d * 1.45 + 0.6;
    const A = camera.position.clone().addScaledVector(fwd, d).addScaledVector(right, -side * half);
    A.y = rand(1.7, 3.2);
    const L = new THREE.Vector3(spot.x, spot.y + FOOT * b.size, spot.z);
    // across, in a gentle S, then down to the perch
    const M = A.clone().lerp(L, 0.45).addScaledVector(fwd, rand(-0.6, 0.6));
    M.y = Math.max(A.y - 0.2, spot.y + 1.0) + rand(0, 0.6);
    const N = A.clone().lerp(L, 0.8);
    N.y = spot.y + rand(0.35, 0.9);
    const back = new THREE.Vector3().copy(L).sub(N).setY(0);
    if (back.lengthSq() > 1e-4) N.addScaledVector(back.normalize(), -0.2);
    const pts = [A, M, N, L];
    b.pos.copy(A);
    b.yaw = Math.atan2(L.x - A.x, L.z - A.z);
    b.path = { pts, u: 0, len: this.pathLength(pts), spot, age: 0 };
    if (!spot.temp) spot.owner = b;
    b.plan = null;
    b.state = 'fly';
    b.fm = 'flap';
    b.fmT = rand(0.7, 1.1);
    b.flapPhase = 0;
    b.launchT = 5;
    b.flap = 0.3;
    b.fold = 0;
    b.legs = 0.06;
    b.tilt = 0;
    b.roll = 0;
    b.hopY = 0;
    b.crouch = 0;
    b.hp = 0;
    b.hy = 0;
    b.hr = 0;
    b.bob = 0;
    b.prevFlap = 0;
    b.yawRate = 0;
    b.fade = 1;
  }

  // ------------------------------------------------------------ flight

  fly(b, dt, t, camera) {
    const P = b.path;
    P.age += dt;
    b.launchT += dt;
    const cruise = (this.calm ? 1.7 : 2.5) * (0.92 + b.phase * 0.2);
    // the distance still to go, for the approach and the flare
    const remain = (1 - P.u) * P.len;
    const landing = !!P.spot && remain < 0.7;
    let v = cruise * (0.32 + 0.68 * smooth(0, 0.7, b.launchT));
    if (P.spot) v *= 0.3 + 0.7 * smooth(0.05, 1.2, remain);
    if (b.fm === 'glide') v *= 0.92;
    P.u = Math.min(1, P.u + (v * dt) / P.len);
    bezier(P.pts, P.u, _p);
    bezier(P.pts, Math.min(1, P.u + 0.012), _v);
    bezier(P.pts, Math.max(0, P.u - 0.012), _w);
    const vx = _v.x - _w.x;
    const vy = _v.y - _w.y;
    const vz = _v.z - _w.z;
    const hv = Math.hypot(vx, vz);
    // heading, banking into the turn
    if (hv > 1e-5) {
      const dy = angleDiff(b.yaw, Math.atan2(vx, vz));
      const k = 1 - Math.exp(-7 * dt);
      b.yaw += dy * k;
      b.yawRate = damp(b.yawRate, (dy * k) / Math.max(dt, 1e-4), 10, dt);
    }
    const climb = Math.atan2(vy, Math.max(hv, 1e-5));
    b.tilt = damp(b.tilt, clamp(climb * 0.9, -0.55, 0.65), 7, dt);
    b.roll = damp(b.roll, clamp(-b.yawRate * 0.2, -0.75, 0.75), 8, dt);
    // wings: bursts of flapping with glides and tucked bounds between
    const short = P.len < 2.6;
    if (landing) b.fm = 'flare';
    else if (b.launchT < 0.7 || short) b.fm = 'flap';
    else {
      b.fmT -= dt;
      if (b.fmT <= 0) {
        const r = Math.random();
        if (b.fm === 'flap') {
          b.fm = P.spot && remain < 2.4 ? 'glide' : r < 0.5 ? 'tuck' : 'glide';
          b.fmT = b.fm === 'tuck' ? rand(0.14, 0.24) : rand(0.35, 0.7);
        } else {
          b.fm = 'flap';
          b.fmT = rand(0.5, 0.95);
        }
      }
    }
    let freq = 8.2;
    let amp = 0.82;
    let base = 0.2;
    if (b.fm === 'flare') {
      freq = 12.5;
      amp = 1.0;
      base = 0.55;
    } else if (b.launchT < 0.7) {
      freq = 10.5;
      amp = 0.95;
      base = 0.35;
    }
    if (this.calm) freq *= 0.75;
    const flapping = b.fm === 'flap' || b.fm === 'flare';
    let flapT = 0;
    let bendT = 0;
    let foldT = 0;
    let retractT = 0;
    if (flapping) {
      b.flapPhase = (b.flapPhase + dt * freq) % 1;
      flapT = base + amp * flapAt(b.flapPhase);
      retractT = retractAt(b.flapPhase) * 0.75;
      // the tips trail the stroke: bend against the wing's speed
      bendT = clamp(-((flapT - b.prevFlap) / Math.max(dt, 1e-3)) * 0.03, -0.4, 0.4);
    } else if (b.fm === 'glide') {
      flapT = 0.14;
      bendT = -0.18;
    } else {
      foldT = 0.95;
    }
    b.prevFlap = flapT;
    b.flap = damp(b.flap, flapT, flapping ? 40 : 14, dt);
    b.bend = damp(b.bend, bendT, 30, dt);
    b.fold = damp(b.fold, foldT, 16, dt);
    b.retract = damp(b.retract, retractT, 30, dt);
    // the legs tuck up in flight and come out to land; the tail fans in the flare
    const legsT = landing ? 1 : b.launchT < 0.18 ? 1 - (b.launchT / 0.18) * 0.94 : 0.06;
    b.legs = damp(b.legs, legsT, landing ? 9 : 18, dt);
    b.tailS = damp(b.tailS, landing ? 1 : b.fm === 'glide' ? 0.25 : 0, 10, dt);
    b.tailP = damp(b.tailP, landing ? -0.7 : -0.12 + (flapping ? 0.06 * Math.sin(b.flapPhase * TAU) : 0), 12, dt);
    if (landing) b.tilt = damp(b.tilt, 0.75, 9, dt);
    b.thy = 0;
    b.thp = 0.05;
    b.puff = damp(b.puff, 0, 10, dt);
    // an undulating path: up on a burst of flapping, down on a glide, level near the perch
    const bobT = this.calm ? 0 : b.fm === 'flap' ? 0.04 : b.fm === 'tuck' ? -0.035 : -0.01;
    b.bob = damp(b.bob, bobT, 5, dt);
    const level = P.spot ? smooth(0.9, 0.35, remain) : 1;
    const beat = flapping ? Math.cos(b.flapPhase * TAU) * 0.006 : 0;
    b.pos.set(_p.x, _p.y + (b.bob + beat) * level, _p.z);
    b.hopY = 0;
    b.crouch = 0;
    // a bird that flies off and is still in view when its path ends shrinks away rather than vanishing
    b.fade = P.spot ? 1 : smooth(1, 0.82, P.u);
    if (P.u >= 1) this.arrived(b);
    else if (!P.spot && P.u > 0.3 && !this.onScreen(b.pos, camera, 0.15)) this.gone(b);
  }

  onScreen(p, camera, margin = 0) {
    _v.copy(p).project(camera);
    return _v.z < 1 && Math.abs(_v.x) < 1 + margin && Math.abs(_v.y) < 1 + margin;
  }

  gone(b) {
    b.state = 'away';
    b.timer = rand(9, 24) * (this.calm ? 1.4 : 1);
    b.path = null;
    b.visible = false;
  }

  arrived(b) {
    const spot = b.path.spot;
    b.path = null;
    if (!spot) return this.gone(b);
    b.spot = spot;
    b.surf.set(spot.x, spot.y, spot.z);
    b.state = 'settle';
    b.actT = 0;
    if (Math.random() < 0.3) this.startSong(b, true);
    this.sound?.()?.flutter(b.pos.x, b.pos.y, b.pos.z, 0.5);
  }

  // touch down: the wings fold, a small bounce, then a look around
  settle(b, dt) {
    const k = clamp(b.actT / 0.42, 0, 1);
    b.pos.set(b.surf.x, b.surf.y + FOOT * b.size + 0.012 * Math.sin(k * Math.PI) * (1 - k), b.surf.z);
    b.fold = damp(b.fold, 1, 12, dt);
    b.flap = damp(b.flap, 0.1, 10, dt);
    b.bend = damp(b.bend, 0, 12, dt);
    b.retract = damp(b.retract, 0, 12, dt);
    b.legs = damp(b.legs, 1, 12, dt);
    b.tailS = damp(b.tailS, 0, 8, dt);
    b.tailP = damp(b.tailP, 0.3 * (1 - k), 8, dt);
    b.tilt = damp(b.tilt, this.perchTilt(b.spot), 9, dt);
    b.roll = damp(b.roll, 0, 9, dt);
    b.puff = damp(b.puff, 0, 8, dt);
    b.yaw += angleDiff(b.yaw, b.spot.yaw) * (1 - Math.exp(-6 * dt));
    if (k >= 1) this.land(b, b.spot);
  }

  headStep(b, dt) {
    const fast = b.act === 'peck' || b.act === 'drink';
    const rate = b.state === 'fly' ? 8 : fast ? 26 : this.calm ? 5 : 11;
    b.hy = damp(b.hy, b.thy, rate, dt);
    b.hp = damp(b.hp, b.thp, rate, dt);
    if (b.state === 'fly' || b.state === 'crouch') b.hr = damp(b.hr, 0, 8, dt);
  }

  // ------------------------------------------------------------ output

  write(b) {
    const i = b.i;
    if (b.state === 'away') {
      _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m);
      this.shadows.setMatrixAt(i, _m);
      return;
    }
    _e.set(-b.tilt, b.yaw, b.roll, 'YXZ');
    _q.setFromEuler(_e);
    const sc = b.size * Math.max(0.001, b.fade);
    this.mesh.setMatrixAt(i, _m.compose(b.pos, _q, _s.setScalar(sc)));
    this.aPose.setXYZW(i, b.flap, b.bend, b.fold, b.retract);
    this.aLook.setXYZW(i, b.hy, b.hp, b.hr, b.tailP);
    this.aExtra.setXYZW(i, b.beak, b.legs, b.puff, b.blink);
    this.aMore.setXYZW(i, b.tailS, 0, 0, 0);
    // the blob of shadow: tighter and darker the nearer the bird is to the ground
    const gy = groundAt(b.pos.x, b.pos.z);
    const h = Math.max(0, b.pos.y - gy);
    const near = clamp(1 - h / 2.4, 0, 1);
    const sz = sc * (0.085 + Math.min(h, 2) * 0.03);
    _q.setFromAxisAngle(_up, b.yaw);
    this.shadows.setMatrixAt(i, _m.compose(_p.set(b.pos.x, gy + 0.014, b.pos.z), _q, near > 0.03 ? _s.set(sz * 1.15, 1, sz * (0.8 + near * 0.4)) : _s.set(0, 0, 0)));
  }

  upload() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.aPose.needsUpdate = true;
    this.aLook.needsUpdate = true;
    this.aExtra.needsUpdate = true;
    this.aMore.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh, this.shadows);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.shadows.geometry.dispose();
    this.shadows.material.dispose();
  }
}
