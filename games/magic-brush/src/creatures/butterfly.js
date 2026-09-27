// Flutter, a butterfly: a big round fuzzy head with huge glossy eyes, rosy
// cheeks and a smile, curly antennae with little beads on the ends, a plush
// thorax and a chubby striped tail, and four big wings, thin membranes with
// fine veins, a scalloped dark margin dotted with cream, a heart on each
// wing and scales that shimmer. The child's painting is the wings' colour.
//
// It flies: the root bone lifts it 0.3-0.9 m while it roams, flapping with a
// real wing-beat (a quick downstroke that lifts the body, a slower upstroke
// while it sinks), gliding now and then, and it flutters down to land when
// it stops, slowly fanning its wings in the sun.
//
// Tricks: 'loop' (a loop-the-loop, turned side-on so you see the circle, with
// a sparkly trail), 'sparkle' (a fast flutter that shakes sparkle dust off
// its wings) and 'flower' (lands as if on a flower, squints happily and fans
// its wings slowly, puffing pollen).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, bindBy, frameFrom } from './parts.js';
import { mergeGeometries } from './sculpt.js';
import { pose, addPose, bump, ramp, smooth, wobble, Spring, TAU, clamp, lerp } from './anim.js';
import { glide, puff, flaps } from '../sound/calls.js';

const FUZZ = 0x6d4fb0;
const FACE = 0xf6e8f4;
const CHEEK = 0xff8fae;
const DARK = 0x2a1f38;
const MOUTH = 0x4a1838;
const SPARKS = [[1.9, 1.5, 0.8], [1.7, 1.0, 1.9], [0.9, 1.6, 2.0], [2.0, 1.1, 1.3]];
const POLLEN = [[2.0, 1.6, 0.5], [1.9, 1.3, 0.4], [2.0, 1.9, 1.2]];
// the legs (left bone, right bone, forwards), for the per-frame pose
const LEGS = [['leg1L', 'leg1R', 1], ['leg2L', 'leg2R', 0], ['leg3L', 'leg3R', -1]];

// where the wings join the body (left side; the right is mirrored)
const FORE_ROOT = [0.018, 0.07, 0.022];
const HIND_ROOT = [0.016, 0.064, -0.004];
// the head, the paler face on it and the eyes
const HEAD_C = [0, 0.08, 0.078];
const HEAD_R = [0.053, 0.049, 0.046];
const FACE_C = [0, 0.068, 0.094];
const FACE_R = [0.039, 0.028, 0.03];
const EYE = [0.026, 0.087, 0.11];
const EYE_R = 0.0235;
const EYE_DIR = [0.38, 0.08, 1];
const DIHEDRAL = 0.12;
// wing outlines in each wing's own plane: x out from the body, z forward
const FORE = [[0.04, 0.032], [0.088, 0.07], [0.136, 0.098], [0.172, 0.108], [0.196, 0.094], [0.204, 0.062], [0.194, 0.022], [0.166, -0.012], [0.124, -0.03], [0.074, -0.034], [0.03, -0.022]];
const HIND = [[0.066, 0.01], [0.116, -0.004], [0.148, -0.034], [0.154, -0.074], [0.136, -0.11], [0.1, -0.134], [0.062, -0.138], [0.032, -0.118], [0.012, -0.08], [0.003, -0.04]];
// a heart on each wing: centre (wing plane), size, and the way it points
const HEARTS = [
  { wing: 'fore', c: [0.136, 0.052], size: 0.027, up: 0.45 },
  { wing: 'hind', c: [0.098, -0.082], size: 0.024, up: -0.65 },
];

// An antenna point: a along the way it leans (out and forward), b up (tilted
// outwards, so the curl at its end shows from the front and from above).
const ANT_BASE = [0.014, 0.114, 0.084];
function set2(a, x, y) {
  a[0] = x;
  a[1] = y;
  return a;
}

function antPoint(side, a, b) {
  const h = [side * 0.55, 0, 0.84];
  const pl = Math.hypot(0.84, 0.55);
  const p = [(side * 0.84) / pl, 0, -0.55 / pl];
  const u = [p[0] * 0.45, 1, p[2] * 0.45];
  const ul = Math.hypot(...u);
  return [side * ANT_BASE[0] + h[0] * a + (u[0] / ul) * b, ANT_BASE[1] + (u[1] / ul) * b, ANT_BASE[2] + h[2] * a + (u[2] / ul) * b];
}
const ANT_SHAFT = [[0, 0], [0.008, 0.018], [0.019, 0.034], [0.032, 0.047]];
const ANT_CURL = [0.052, 0.052];

// ------------------------------------------------------------ wing geometry

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-12;
  const k = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return [Math.hypot(px - ax - dx * k, pz - az - dz * k), k];
}

// wing-plane point -> the friend's rest space. The wing is gently cambered
// (highest a third of the way out), the same for wings and hearts.
const CAMBER = 0.004;
function wingPoint(root, side, px, pz, lift = 0) {
  const r = Math.min(1, Math.hypot(px, pz) / 0.2);
  const c = CAMBER * 4 * r * (1 - r);
  return [side * (root[0] + px * Math.cos(DIHEDRAL)), root[1] + px * Math.sin(DIHEDRAL) + c + lift, root[2] + pz];
}

// A wing: a fan of rays from its root to a smooth outline, with rings packed
// towards the edge so the margin pattern is crisp. aWing carries the wing
// plane position and the distance to the outer margin and to the inner
// edges (for the shader's veins, margin and dots), aArc the length along
// the margin.
function wingGeometry(outline, root, side, { samples = 64 } = {}) {
  const curve = new THREE.CatmullRomCurve3(outline.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const pts = curve.getSpacedPoints(samples - 1).map((v) => [v.x, v.z]);
  const arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const rings = [0.1, 0.22, 0.34, 0.46, 0.57, 0.67, 0.75, 0.82, 0.87, 0.91, 0.94, 0.965, 0.985, 1];
  const pos = [];
  const wing = [];
  const arcs = [];
  const span = [];
  const last = pts[pts.length - 1];
  const push = (px, pz, s) => {
    let dOut = Infinity;
    let aOut = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [d, k] = segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d < dOut) {
        dOut = d;
        aOut = arc[i] + (arc[i + 1] - arc[i]) * k;
      }
    }
    const dIn = Math.min(segDist(px, pz, 0, 0, pts[0][0], pts[0][1])[0], segDist(px, pz, last[0], last[1], 0, 0)[0]);
    pos.push(...wingPoint(root, side, px, pz));
    wing.push(px, pz, dOut, dIn);
    arcs.push(aOut);
    span.push(Math.hypot(px, pz));
  };
  push(0, 0, 0);
  for (const p of pts) for (const s of rings) push(p[0] * s, p[1] * s, s);
  const idx = [];
  const R = rings.length;
  const v = (j, i) => 1 + j * R + i;
  for (let j = 0; j < pts.length - 1; j++) {
    idx.push(0, v(j, 0), v(j + 1, 0));
    for (let i = 0; i < R - 1; i++) idx.push(v(j, i), v(j, i + 1), v(j + 1, i), v(j + 1, i), v(j, i + 1), v(j + 1, i + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 4));
  g.setAttribute('aArc', new THREE.Float32BufferAttribute(arcs, 1));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  g.setIndex(side > 0 ? idx : idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]]));
  g.computeVertexNormals();
  return g;
}

// A heart patch lying just over both faces of a wing. aWing.zw holds the
// heart's own coordinates (point at 0, lobes up to ~1.1) for its rim.
function heartGeometry(h, root, side) {
  const N = 72;
  const ring = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    // the classic heart curve, scaled to about 1 across
    const x = 16 * Math.pow(Math.sin(a), 3) / 17;
    const y = (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17;
    ring.push([x * 0.62, y * 0.62 + 0.62]);
  }
  const up = [Math.cos(h.up), Math.sin(h.up)];
  const rt = [up[1], -up[0]];
  const toWing = (x, y) => [h.c[0] + (rt[0] * x + up[0] * y) * h.size, h.c[1] + (rt[1] * x + up[1] * y) * h.size];
  const pos = [];
  const wing = [];
  const idx = [];
  const rings = [0, 0.35, 0.65, 0.85, 1];
  for (const face of [1, -1]) {
    const base = pos.length / 3;
    const cx = 0, cy = 0.55;
    for (let i = 0; i < N; i++)
      for (const s of rings) {
        const x = cx + (ring[i][0] - cx) * s;
        const y = cy + (ring[i][1] - cy) * s;
        const [px, pz] = toWing(x, y);
        const p = wingPoint(root, side, px, pz, face * 0.0007);
        pos.push(...p);
        wing.push(px, pz, x, y);
      }
    const R = rings.length;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      for (let k = 0; k < R - 1; k++) {
        const a = base + i * R + k, b = base + i * R + k + 1, c = base + j * R + k, d = base + j * R + k + 1;
        if (face * side > 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 4));
  g.setAttribute('aArc', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ wing material

// The friend's membrane material, extended for butterfly wings: veins that
// branch from a closed cell, a scalloped dark margin with cream dots, a
// darker, hairy base, rows of tiny scales that catch the light one by one,
// and (kind 2) a pale heart with a fine rim.
const WING_PARS = /* glsl */ `
uniform float uKind;
varying vec4 vWing;
varying float vArc;
float bfRay(vec2 p, float a0, float r0, float r1) {
  float r = length(p);
  float a = atan(p.y, p.x) - a0 + r * 1.2;
  if (r < r0 || r > r1) return 1.0;
  return abs(r * sin(a)) + (cos(a) < 0.0 ? 1.0 : 0.0);
}
float bfArc(vec2 p, float r0, float a0, float a1) {
  float r = length(p);
  float a = atan(p.y, p.x) + r * 1.2;
  if (a < a0 || a > a1) return 1.0;
  return abs(r - r0);
}
float bfHeart(vec2 p) {
  p.x = abs(p.x);
  p.y += 0.02;
  if (p.y + p.x > 1.0) return sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)), dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}`;

const WING_COLOR = /* glsl */ `
vec2 bfP = vWing.xy;
float bfR = length(bfP);
float bfLive = 1.0 - mbPaintState * uAliveOn;
// veins: rays from the root, a closed cell near the middle, branches past it
float bfV = 1.0;
if (uKind < 0.5) {
  bfV = min(bfV, bfRay(bfP, 0.44, 0.012, 1.0));
  bfV = min(bfV, bfRay(bfP, 0.3, 0.012, 1.0));
  bfV = min(bfV, bfRay(bfP, -0.14, 0.012, 1.0));
  bfV = min(bfV, bfRay(bfP, -0.36, 0.012, 1.0));
  bfV = min(bfV, bfRay(bfP, -0.56, 0.012, 1.0));
  bfV = min(bfV, bfRay(bfP, 0.19, 0.088, 1.0));
  bfV = min(bfV, bfRay(bfP, 0.08, 0.09, 1.0));
  bfV = min(bfV, bfRay(bfP, -0.03, 0.088, 1.0));
  bfV = min(bfV, bfArc(bfP, 0.088, -0.03, 0.4));
} else if (uKind < 1.5) {
  bfV = min(bfV, bfRay(bfP, 0.06, 0.01, 1.0));
  bfV = min(bfV, bfRay(bfP, -0.2, 0.01, 1.0));
  bfV = min(bfV, bfRay(bfP, -0.9, 0.01, 1.0));
  bfV = min(bfV, bfRay(bfP, -1.15, 0.01, 1.0));
  bfV = min(bfV, bfRay(bfP, -1.36, 0.01, 1.0));
  bfV = min(bfV, bfRay(bfP, -0.38, 0.066, 1.0));
  bfV = min(bfV, bfRay(bfP, -0.55, 0.068, 1.0));
  bfV = min(bfV, bfRay(bfP, -0.72, 0.066, 1.0));
  bfV = min(bfV, bfArc(bfP, 0.066, -0.72, -0.1));
}
float bfVw = mix(0.0011, 0.0006, smoothstep(0.0, 0.16, bfR));
float bfVf = fwidth(bfV) + 1e-5;
float bfVein = (1.0 - smoothstep(bfVw - bfVf, bfVw + bfVf, bfV)) * bfLive;
// the margin: a scalloped dark band with a row of cream dots
float bfBw = (uKind < 0.5 ? 0.0105 : 0.0125) * (1.0 + 0.2 * cos(vArc * 6.2832 / 0.021));
float bfEf = fwidth(vWing.z) + 1e-5;
float bfEdge = uKind < 1.5 ? (1.0 - smoothstep(bfBw - bfEf, bfBw + bfEf, vWing.z)) : 0.0;
float bfRim = uKind < 1.5 ? (1.0 - smoothstep(0.0022 - bfEf, 0.0022 + bfEf, vWing.w)) : 0.0;
vec2 bfDq = vec2((fract(vArc / 0.021) - 0.5) * 0.021, vWing.z - 0.0055);
float bfDl = length(bfDq);
float bfDot = uKind < 1.5 ? (1.0 - smoothstep(0.0024 - bfEf, 0.0024 + bfEf, bfDl)) * step(0.004, vArc) : 0.0;
bfEdge *= bfLive;
bfRim *= bfLive;
bfDot *= bfLive;
// tiny scales in rows along the rays, each a little different
vec2 bfS = vec2(bfR / 0.0012, atan(bfP.y, bfP.x) * bfR / 0.0009);
bfS.y += 0.5 * mod(floor(bfS.x), 2.0);
vec2 bfCell = floor(bfS);
vec2 bfF = fract(bfS);
float bfSid = mbHash1(vec3(bfCell, uKind * 7.0 + 1.3));
float bfSfw = length(fwidth(bfS));
float bfSk = (1.0 - smoothstep(0.35, 0.9, bfSfw)) * bfLive;
float bfSh = bfF.x * (1.0 - pow(abs(bfF.y - 0.5) * 2.0, 2.0));
float bfGlint = step(0.965, bfSid) * bfSk;
// colour
vec3 bfCol = mbBase * mix(1.0, 0.9 + 0.2 * bfSid, bfSk);
bfCol *= mix(0.72, 1.0, smoothstep(0.004, 0.045, bfR) * bfLive + (1.0 - bfLive));
vec3 bfDark = mbBase * 0.26 + vec3(0.012, 0.008, 0.02);
bfCol = mix(bfCol, bfDark, max(bfEdge, bfRim * 0.8));
bfCol = mix(bfCol, mbBase * 0.34, bfVein * 0.85 * (1.0 - bfEdge));
bfCol = mix(bfCol, mix(vec3(1.0, 0.96, 0.86), mbBase, 0.18), bfDot);
float bfHeartRim = 0.0;
if (uKind > 1.5) {
  float hd = bfHeart(vWing.zw);
  float hf = fwidth(hd) + 1e-4;
  bfHeartRim = (1.0 - smoothstep(0.07 - hf, 0.07 + hf, abs(hd + 0.07))) * bfLive;
  bfCol = mix(bfCol, mbBase * 0.3, bfHeartRim);
  bfVein = 0.0;
}
bfCol += bfGlint * mbBase * 0.5;
// the underside is paler and softer, as on a real wing
if (!gl_FrontFacing && uKind < 1.5) bfCol = mix(bfCol, bfCol * 0.75 + vec3(0.1, 0.09, 0.08), 0.4 * bfLive);
mbBase = bfCol;
float bfOpaque = max(max(bfEdge, bfVein), max(bfRim, bfHeartRim));
diffuseColor.rgb = mbBase;
`;

const WING_ROUGH = /* glsl */ `
roughnessFactor = clamp(roughnessFactor + (bfSid - 0.5) * 0.25 * bfSk + bfVein * 0.15 - bfGlint * 0.25, 0.08, 1.0);
`;

const WING_NORMAL = /* glsl */ `
if (bfSk > 0.01) {
  // each scale tilts a little its own way, so the wing glitters as it moves
  vec3 bfTl = (mbHash3(vec3(bfCell, uKind + 3.7)) - 0.5) * 0.55 * bfSk * (1.0 - bfVein);
  normal = normalize(normal + bfTl - dot(bfTl, normal) * normal);
  normal = mbPerturb(-vViewPosition, normal, (bfSh * 0.00018 + bfVein * 0.00025) * bfSk, faceDirection);
}
`;

const WING_MATERIAL = /* glsl */ `
#ifdef USE_SHEEN
material.sheenColor *= mix(mbBase * 1.3, vec3(0.9), 0.25);
#endif
#ifdef USE_IRIDESCENCE
material.iridescence *= mix(1.0, 0.35 + 1.1 * bfSid, bfSk) * (1.0 - bfEdge * 0.6);
material.iridescenceThickness = mix(280.0, 640.0, fract(bfSid * 7.3));
#endif
`;

// light through the wing, warmer and stronger than the base membrane's,
// blocked by the veins and the dark margin
const WING_THROUGH = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
{
  vec3 L = directionalLights[0].direction;
  float thr = pow(saturate(dot(normalize(vViewPosition), -L)), 3.0);
  reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * thr * 0.55 * (1.0 - bfOpaque * 0.85);
}
#endif
`;

function wingMaterial(friend, kind) {
  const m = friend.mat('membrane', { iridescence: 0.75 });
  m.sheen = 0.6;
  m.sheenRoughness = 0.4;
  const base = m.onBeforeCompile;
  const own = { uKind: { value: kind } };
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    for (const k in own) sh.uniforms[k] = own[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aWing;\nattribute float aArc;\nvarying vec4 vWing;\nvarying float vArc;')
      .replace('vRest = position;', 'vRest = position;\nvWing = aWing;\nvArc = aArc;');
    sh.fragmentShader = sh.fragmentShader
      .replace('uniform sampler2D tSkin;', `uniform sampler2D tSkin;\n${WING_PARS}`)
      .replace('diffuseColor.rgb = mbBase;', WING_COLOR)
      .replace('roughnessFactor = mix(vMix.z, 0.22, mbPaintState * uAliveOn);', `roughnessFactor = mix(vMix.z, 0.22, mbPaintState * uAliveOn);\n${WING_ROUGH}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${WING_NORMAL}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${WING_MATERIAL}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${WING_THROUGH}`);
  };
  m.customProgramCacheKey = () => 'mb-bfly-wing';
  return m;
}

// ------------------------------------------------------------ the friend

export class Butterfly extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.furry = true;
    this.hideOpts = { sheen: 0.7, clearcoat: 0.2 };
    this.voxelScale = 0.72;
    this.walkSpeed = 0.35;
    this.turnRate = 2.0;
    this.hopScale = 1.4;
    this.shared.uFurLen.value = 0.0105;
    this.shared.uStrand.value = 0.0019;
    this.shared.uComb.value.set(0, -0.25, -0.7);
    this.shared.uSplat.value = 0.2;
    this.sparkleColors = SPARKS;
    // flight
    this.st = 'landed';
    this.alt = new Spring(0, 0.7, 0.85);
    this.fly = 0; // 0 resting pose .. 1 flapping
    this.beat = Math.random();
    this.beatHz = 4.5;
    this.glide = 0;
    this.glideT = 2 + Math.random() * 3;
    this.gliding = false;
    this.idleT = 0;
    this.landDelay = 1.2;
    this.touch = 9; // time since touching down
    this.fanT = 2 + Math.random() * 3;
    this.fan = 0;
    this.seed = Math.random() * 100;
    this.prevHeading = null;
    this.bank = new Spring(0, 1.2, 0.7);
    this.headYaw = new Spring(0, 1.6, 0.8);
    this.headPitch = new Spring(0, 1.6, 0.8);
    this.antL = new Spring(0, 2.6, 0.22);
    this.antR = new Spring(0, 2.4, 0.22);
    this.antS = new Spring(0, 2.0, 0.3);
    this.prevY = 0;
    this.prevVy = 0;
    // what a trick wants of the body, reused every frame (see trickPose)
    this.tp = { alt: null, ofs: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, wing: null, wingAt: [0, 0], hz: null, amp: 1, crouch: 0, squint: 0, head: null, headAt: [0, 0, 0], st: null };
  }

  get tricks() {
    return ['loop', 'sparkle', 'flower'];
  }

  async build() {
    await super.build();
    // wings feather about their own span, then sweep, then flap
    for (const n of ['foreL', 'foreR', 'hindL', 'hindR']) this.bones[n].rotation.order = 'ZYX';
    // turn, then pitch, then roll
    this.bones.root.rotation.order = 'YXZ';
    return this;
  }

  sculpt(s) {
    s.bone('root', null, [0, 0.056, 0.0]);
    s.bone('thorax', 'root', [0, 0.056, 0.01]);
    s.bone('head', 'thorax', [0, 0.066, 0.046]);
    this.eyeBones(s, EYE);
    s.bone('abd0', 'thorax', [0, 0.054, -0.02]);
    s.bone('abd1', 'abd0', [0, 0.051, -0.05]);
    s.bone('abd2', 'abd1', [0, 0.052, -0.08]);
    s.bones2('ant', 'head', antPoint(1, 0, 0));
    s.bones2('antTip', 'ant', antPoint(1, ...ANT_SHAFT[3]));
    s.bones2('fore', 'thorax', FORE_ROOT);
    s.bones2('foreTip', 'fore', wingPoint(FORE_ROOT, 1, 0.1, 0.04));
    s.bones2('hind', 'thorax', HIND_ROOT);
    s.bones2('hindTip', 'hind', wingPoint(HIND_ROOT, 1, 0.075, -0.05));
    s.bones2('leg1', 'thorax', [0.012, 0.036, 0.03]);
    s.bones2('leg2', 'thorax', [0.014, 0.033, 0.01]);
    s.bones2('leg3', 'thorax', [0.012, 0.035, -0.01]);

    const fuzz = { paint: 0.88, fur: 1, rough: 0.75, pat: 0, tint: FUZZ };
    s.setLook(fuzz);
    // thorax and a fluffy collar
    s.ellipsoid([0, 0.056, 0.008], [0.03, 0.028, 0.035], { bone: 'thorax', k: 0.02 });
    s.ellipsoid([0, 0.062, 0.036], [0.029, 0.027, 0.018], { bone: 'thorax', k: 0.02 });
    // head: big and round, a paler face, rosy cheeks
    const head = { bone: 'head', fur: 0, paint: 0.86, rough: 0.5 };
    s.ellipsoid(HEAD_C, HEAD_R, { ...head, k: 0.018 });
    s.ellipsoid(FACE_C, FACE_R, { ...head, k: 0.02, tint: FACE, paint: 0.42 });
    s.sphere([0.034, 0.066, 0.104], 0.0125, { ...head, k: 0.012, sym: true, tint: CHEEK, paint: 0.1, rough: 0.6 });
    // a fluffy tuft on top, between the antennae
    s.ellipsoid([0, 0.124, 0.066], [0.02, 0.012, 0.02], { ...head, k: 0.014, fur: 1, rough: 0.75 });
    // a chubby striped tail, lifting a little at the end
    const tail = { fur: 0.55 };
    s.chain(
      [[0, 0.055, -0.014], [0, 0.051, -0.044], [0, 0.05, -0.074], [0, 0.053, -0.098], [0, 0.058, -0.114]],
      [0.024, 0.023, 0.018, 0.012, 0.0055],
      { bones: ['abd0', 'abd1', 'abd2', 'abd2'], k: 0.012, ...tail },
    );
    const rings = [[-0.034, 0.0232, 'abd0', 0.0535], [-0.052, 0.0222, 'abd1', 0.051], [-0.069, 0.0198, 'abd1', 0.0503], [-0.085, 0.0165, 'abd2', 0.051], [-0.1, 0.0122, 'abd2', 0.0536]];
    for (const [z, r, bone, y] of rings) s.torus([0, y, z], r + 0.0014, 0.003, { bone, sub: true, k: 0.004, rot: [Math.PI / 2, 0, 0], tint: DARK, paint: 0.45, fur: 0.3 });
  }

  parts(s) {
    const I = s.index;
    this.addEyes(s, {
      c: EYE,
      r: EYE_R,
      dir: EYE_DIR,
      iris: 0x7a4ad8,
      iris2: 0x2a86c8,
      irisSize: 0.92,
      pupil: 0.44,
      lid: { tint: FUZZ, paint: 0.86, open: -0.68, closed: 1.45 },
    });

    // lash lines along the lids' rims, with a flick at the outer corner:
    // eyeliner when the eyes are open, a happy curve when they close
    const lashMat = this.mat('solid', { clearcoat: 0.3 });
    const lashG = [];
    for (const side of [1, -1]) {
      const cc = [EYE[0] * side, EYE[1], EYE[2]];
      const fr = frameFrom([EYE_DIR[0] * side, EYE_DIR[1], EYE_DIR[2]]);
      const R = EYE_R * 1.07 * 1.015;
      const tilt = -0.35; // as the lid is tipped back (see lidGeometry)
      // outer corner first: +x of the eye frame is outwards for the left eye
      const outer = side > 0 ? 0 : Math.PI;
      const dir = side > 0 ? 1 : -1;
      const pts = [];
      for (let i = -3; i <= 22; i++) {
        const k = i / 22;
        const phi = outer + dir * lerp(0.1, Math.PI - 0.25, k);
        const lift = i < 0 ? 0.0022 * (-i) : 0; // the flick curls up and out
        const x = R * Math.cos(phi) * (i < 0 ? 1 + 0.02 * -i : 1);
        const z = R * Math.sin(phi);
        const y = lift;
        pts.push([x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)]);
      }
      const P = pts.map(([x, y, z]) => [cc[0] + fr.x.x * x + fr.y.x * y + fr.z.x * z, cc[1] + fr.x.y * x + fr.y.y * y + fr.z.y * z, cc[2] + fr.x.z * x + fr.y.z * y + fr.z.z * z]);
      const g = tubeGeometry(P, [0.0005, 0.0009, 0.0013, 0.0014, 0.0013, 0.0009, 0.0006], { radial: 6, steps: 48 });
      withLook(g, { tint: 0x24142c, rough: 0.35 });
      lashG.push(bindTo(g, I['lid' + (side > 0 ? 'L' : 'R')]));
    }
    this.addMesh(mergeGeometries(lashG), lashMat, { shadow: false }).userData.noProject = true;

    // a smile and the corners of it, laid on the face
    const face = (x, y) => {
      // a point on the face ellipsoid (in front), a hair beneath its surface
      const c = FACE_C, r = FACE_R;
      const u = x / r[0], v = (y - c[1]) / r[1];
      const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      return [x, y, c[2] + r[2] * w + 0.0045];
    };
    const smile = [];
    for (let i = 0; i <= 12; i++) {
      const u = (i / 12) * 2 - 1;
      smile.push(face(u * 0.013, 0.061 - 0.005 * (1 - u * u)));
    }
    const mouth = tubeGeometry(smile, [0.0011, 0.0014, 0.0014, 0.0011], { radial: 8, steps: 24 });
    withLook(mouth, { tint: MOUTH, rough: 0.5 });
    const mouthMat = this.mat('solid', { clearcoat: 0.4 });
    this.addMesh(bindTo(mouth, I.head), mouthMat, { shadow: false }).userData.noProject = true;

    // antennae: up and out, curling over at the ends, with glossy beads
    const antMat = this.mat('solid', { clearcoat: 0.6 });
    const beadMat = this.mat('solid', { clearcoat: 1, iridescence: 0.6 });
    const antG = [];
    const beadG = [];
    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      const at = (a, b) => antPoint(side, a, b);
      const pts = ANT_SHAFT.map(([a, b]) => at(a, b));
      // the curl: a shrinking spiral over the top and down, inwards
      const [cx, cy] = ANT_CURL;
      for (let i = 1; i <= 16; i++) {
        const k = i / 16;
        const a = Math.PI * 0.86 - k * Math.PI * 1.8;
        const r = lerp(0.019, 0.0075, k);
        pts.push(at(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      const g = tubeGeometry(pts, [0.0026, 0.0022, 0.0019, 0.0017, 0.0017], { radial: 8, steps: 64 });
      withLook(g, { tint: DARK, paint: 0.3, rough: 0.35 });
      const b0 = pts[0];
      bindBy(g, (x, y, z) => {
        const k = smooth((Math.hypot(x - b0[0], y - b0[1], z - b0[2]) - 0.028) / 0.03);
        return [[I['ant' + S], 1 - k], [I['antTip' + S], k]];
      });
      antG.push(g);
      const end = pts[pts.length - 1];
      const bead = new THREE.SphereGeometry(0.007, 20, 14);
      bead.deleteAttribute('uv');
      bead.translate(end[0], end[1], end[2]);
      withLook(bead, { tint: 0xffd1ec, paint: 0.7, rough: 0.2 });
      beadG.push(bindTo(bead, I['antTip' + S]));
    }
    this.addMesh(mergeGeometries(antG), antMat, { shadow: false });
    this.addMesh(mergeGeometries(beadG), beadMat, { shadow: false });

    // six little legs under the thorax, with round feet
    const legMat = this.mat('solid', { clearcoat: 0.5 });
    const legs = [
      ['leg1', [0.01, 0.034, 0.03], [0.021, 0.027, 0.038], [0.025, 0.004, 0.044]],
      ['leg2', [0.012, 0.031, 0.01], [0.025, 0.025, 0.011], [0.03, 0.004, 0.01]],
      ['leg3', [0.01, 0.033, -0.01], [0.021, 0.026, -0.018], [0.025, 0.004, -0.026]],
    ];
    const legG = [];
    for (const [bone, a, b, c] of legs)
      for (const side of [1, -1]) {
        const m = (p) => [p[0] * side, p[1], p[2]];
        const g = tubeGeometry([m(a), m(b), [c[0] * side, c[1] + 0.01, c[2]], m(c)], [0.0046, 0.0041, 0.0036, 0.0036], { radial: 10, steps: 18 });
        withLook(g, { tint: DARK, paint: 0.15, rough: 0.4 });
        legG.push(bindTo(g, I[bone + (side > 0 ? 'L' : 'R')]));
        const foot = new THREE.SphereGeometry(0.0052, 14, 10);
        foot.deleteAttribute('uv');
        foot.scale(1, 0.8, 1.2).translate(c[0] * side, c[1] + 0.0005, c[2]);
        withLook(foot, { tint: DARK, paint: 0.15, rough: 0.4 });
        legG.push(bindTo(foot, I[bone + (side > 0 ? 'L' : 'R')]));
      }
    this.addMesh(mergeGeometries(legG), legMat, { shadow: false });

    // the wings
    const fore = wingMaterial(this, 0);
    const hind = wingMaterial(this, 1);
    const heart = wingMaterial(this, 2);
    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      for (const [kind, outline, root, mat] of [['fore', FORE, FORE_ROOT, fore], ['hind', HIND, HIND_ROOT, hind]]) {
        const bindWing = (g) => {
          const w = g.attributes.aWing;
          return bindBy(g, (x, y, z, i) => {
            const k = smooth((Math.hypot(w.getX(i), w.getY(i)) - 0.035) / 0.1);
            return [[I[kind + S], 1 - k], [I[kind + 'Tip' + S], k]];
          });
        };
        const g = wingGeometry(outline, root, side);
        withLook(g, { tint: 0xb89ae8, paint: 1, rough: 0.42 });
        this.addMesh(bindWing(g), mat, { shadow: true }).userData.region = (kind === 'fore' ? 200 : 210) + (side > 0 ? 0 : 1);
        const h = HEARTS.find((x) => x.wing === kind);
        const hg = heartGeometry(h, root, side);
        withLook(hg, { tint: 0xffe98a, paint: 0.32, rough: 0.35 });
        // (not receiving shadows: it lies a hair over the wing, which would shade it)
        this.addMesh(bindWing(hg), heart, { shadow: false, receive: false }).userData.region = (kind === 'fore' ? 220 : 230) + (side > 0 ? 0 : 1);
      }
    }
  }

  // ------------------------------------------------------------ motion

  // wing angle over one beat (0..1): a quick downstroke, a slower upstroke
  static stroke(ph) {
    const p = ph - Math.floor(ph);
    const D = 0.4;
    return p < D ? 1 - 2 * smooth(p / D) : -1 + 2 * smooth((p - D) / (1 - D));
  }

  takeOff(kick = 0.9) {
    this.st = 'flying';
    this.alt.kick(kick);
    this.idleT = 0;
    this.landDelay = 0.8 + Math.random() * 1.6;
    this.beat = 0.02; // start on a downstroke
  }

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    const tr = this.trick;
    const u = this.shared;
    const onCanvas = u.uAliveOn.value > 0.5;
    const emerge = onCanvas ? clamp((1.2 - u.uFront.value) / 1.45, 0, 1) : 1;
    const greeting = tr && (tr.name === 'hello' || tr.name === 'bye');

    // ---- where it wants to be: roaming means flying, stopping means landing
    const wantFly = m.speed > 0.04 || m.fly > 0.5;
    if (!tr || greeting) {
      if (this.st === 'landed' && wantFly && !onCanvas) this.takeOff();
      else if (this.st === 'flying') {
        this.idleT = wantFly ? 0 : this.idleT + dt;
        if (this.idleT > this.landDelay) this.st = 'landing';
      } else if (this.st === 'landing' && wantFly) this.st = 'flying';
    }
    let altT = 0;
    if (this.st === 'flying') {
      const n = 0.5 + 0.5 * Math.sin(t * 0.19 + this.seed) * Math.cos(t * 0.07 + this.seed * 0.3);
      altT = 0.3 + 0.55 * n + Math.sin(t * 1.3 + this.seed) * Math.sin(t * 2.1) * 0.03;
      // the first moments of a flight climb steeply
      altT = Math.max(altT, 0.3);
    }
    if (onCanvas || m.air > 0) altT = 0;

    // ---- tricks can take over the altitude
    let trickAlt = null;
    let ofs = null;
    let yawT = 0, pitchT = 0, rollT = 0;
    let wingOverride = null; // [angle, amount]
    let flapHz = null;
    let flapAmp = 1;
    let crouch = 0;
    let squint = 0;
    let headAdd = null;
    if (tr && !greeting) {
      const r = this.trickPose(tr, dt);
      trickAlt = r.alt;
      ofs = r.ofs;
      yawT = r.yaw;
      pitchT = r.pitch;
      rollT = r.roll;
      wingOverride = r.wing;
      flapHz = r.hz;
      flapAmp = r.amp;
      crouch = r.crouch;
      squint = r.squint;
      headAdd = r.head;
      if (r.st && !(r.st === 'landing' && this.st === 'landed')) this.st = r.st;
    }
    if (trickAlt !== null) altT = trickAlt;
    const prevAlt = this.alt.x;
    let alt = this.alt.update(altT, dt);
    if (alt < 0) {
      alt = 0;
      this.alt.x = 0;
      if (this.alt.v < 0) this.alt.v = 0;
    }
    // touching down
    if ((this.st === 'landing' || (tr && trickAlt === 0)) && alt < 0.004 && prevAlt >= alt) {
      if (this.st !== 'landed') this.touch = 0;
      this.st = 'landed';
      this.alt.x = 0;
      this.alt.v = 0;
      alt = 0;
    }
    this.touch += dt;
    const airborne = this.st !== 'landed' || alt > 0.003;

    // ---- how much the wings flap (vs rest), and how fast
    let flyT = airborne ? 1 : 0;
    if (this.st === 'landing') flyT = clamp(alt / 0.06, 0.25, 1);
    if (m.air > 0) flyT = Math.max(flyT, m.air * (onCanvas ? emerge * emerge : 1));
    if (greeting) flyT = Math.max(flyT, 0.85);
    if (wingOverride) flyT = Math.max(flyT, 1 - wingOverride[1]);
    this.fly += (flyT - this.fly) * (1 - Math.exp(-dt * 7));
    const fly = this.fly;

    // glides: every few seconds of cruising, wings held in a V for a moment
    const cruising = this.st === 'flying' && !tr && m.speed > 0.1;
    this.glideT -= dt;
    if (this.glideT <= 0) {
      this.gliding = !this.gliding && cruising;
      this.glideT = this.gliding ? 0.5 + Math.random() * 0.7 : 1.8 + Math.random() * 3;
    }
    if (!cruising) this.gliding = false;
    this.glide += ((this.gliding ? 1 : 0) - this.glide) * (1 - Math.exp(-dt * 6));
    if (this.gliding) this.alt.v -= dt * 0.08;

    const climb = clamp((altT - alt) * 3, -1, 1);
    let hz = flapHz ?? (m.air > 0 ? 6.5 : lerp(4.4, 6, Math.max(0, climb)) - (this.st === 'landing' ? 0.8 : 0));
    if (greeting) hz = 6.5;
    this.beat += dt * hz * (1 - this.glide * 0.9) * Math.max(0.05, fly);
    const ph = this.beat;
    const beatA = Butterfly.stroke(ph);
    const beatAh = Butterfly.stroke(ph - 0.05);
    const dA = (Butterfly.stroke(ph + 0.02) - Butterfly.stroke(ph - 0.02)) / 0.04; // per beat
    const amp = flapAmp * (m.air > 0 && onCanvas ? 0.6 : 1);
    // up 1.25 rad .. down -0.42 rad around a raised middle
    const flapF = lerp(0.42, 0.42 + beatA * 0.84, amp);
    const flapH = lerp(0.42, 0.42 + beatAh * 0.84, amp);
    const glideWing = 0.34 + Math.sin(t * 9) * 0.02;

    // resting: wings open in a shallow V, a slow fan now and then
    this.fanT -= dt;
    if (this.fanT <= 0 && this.fan <= 0 && !tr) {
      this.fan = 0.001;
      this.fanT = 3 + Math.random() * 4;
    }
    let fanA = 0;
    if (this.fan > 0) {
      this.fan += dt;
      fanA = bump(this.fan, 0, 1.7);
      fanA = fanA * fanA * (3 - 2 * fanA);
      if (this.fan > 1.7) this.fan = 0;
    }
    const tremble = Math.sin(t * 23) * 0.012 * Math.pow(Math.max(0, Math.sin(t * 0.7 + this.seed)), 8);
    const restWing = 0.16 + fanA * 1.05 + tremble + Math.sin(t * 1.1) * 0.02;

    let wingF = lerp(restWing, lerp(flapF, glideWing, this.glide), fly);
    let wingH = lerp(restWing * 0.94, lerp(flapH * 0.95, glideWing * 0.9, this.glide), fly);
    if (wingOverride) {
      wingF = lerp(wingF, wingOverride[0], wingOverride[1]);
      wingH = lerp(wingH, wingOverride[0] * 0.95, wingOverride[1]);
    }
    // the outer wing lags the stroke (it bends against the air)
    const flex = clamp(-dA * 0.05, -0.28, 0.28) * fly * (1 - this.glide) * amp;
    const feather = clamp(dA * 0.035, -0.22, 0.22) * fly * (1 - this.glide);
    const sweep = 0.06 * fly - 0.04 * fanA;
    pose(B.foreL, feather, sweep, wingF);
    pose(B.foreR, feather, -sweep, -wingF);
    pose(B.hindL, feather * 0.6, sweep * 0.5 - 0.02, wingH);
    pose(B.hindR, feather * 0.6, -sweep * 0.5 + 0.02, -wingH);
    pose(B.foreTipL, 0, 0, flex + fanA * 0.08);
    pose(B.foreTipR, 0, 0, -flex - fanA * 0.08);
    pose(B.hindTipL, 0, 0, flex * 1.2 + fanA * 0.1);
    pose(B.hindTipR, 0, 0, -flex * 1.2 - fanA * 0.1);

    // ---- the body: lifted by the downstroke, sinking on the upstroke
    const bob = fly * (1 - this.glide) * amp * -Butterfly.stroke(ph - 0.12) * 0.012;
    const breathe = Math.sin(t * 2.3);
    const root = B.root;
    // drifting a little from side to side, as butterflies do
    const drift = fly * (Math.sin(t * 1.7 + this.seed) * 0.025 + Math.sin(t * 3.1) * 0.01);
    root.position.x += drift + (ofs ? ofs[0] : 0);
    root.position.y += alt + bob + (ofs ? ofs[1] : 0) - crouch * 0.012;
    if (ofs) root.position.z += ofs[2];
    // landing: a soft squash and a bounce
    const settle = wobble(this.touch, 2.2, 0.7);
    root.position.y += -Math.abs(settle) * 0.006 * (this.st === 'landed' ? 1 : 0);
    // banking into turns
    const heading = this.object.rotation.y;
    let yawRate = 0;
    if (this.prevHeading !== null && dt > 0 && !onCanvas && m.air === 0) {
      let d = heading - this.prevHeading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yawRate = d / dt;
    }
    this.prevHeading = heading;
    const bank = this.bank.update(clamp(-yawRate * 0.35, -0.5, 0.5) * fly, dt);
    const pitchFly = (0.22 + climb * 0.12 - m.speed * 0.25) * fly * (1 - this.glide * 0.4);
    root.rotation.y = yawT + Math.sin(t * 1.3 + this.seed) * 0.08 * fly;
    root.rotation.x = -pitchFly - dA * 0.006 * fly * amp + pitchT;
    root.rotation.z = bank + Math.sin(t * 2.3 + this.seed) * 0.06 * fly + rollT;
    // the flutter of air: the root, and so everything, jiggles at the beat
    B.thorax.scale.set(1 + breathe * 0.012, 1 + breathe * 0.012, 1);

    // tail: swings against the beat, breathes when resting
    const tailSwing = fly * amp * Butterfly.stroke(ph - 0.2) * 0.12;
    pose(B.abd0, 0.05 * fly + tailSwing * 0.4 - breathe * 0.02 * (1 - fly) - crouch * 0.1, Math.sin(t * 1.4) * 0.04, 0);
    pose(B.abd1, tailSwing * 0.6 + 0.04 * fly, Math.sin(t * 1.4 - 0.5) * 0.05, 0);
    pose(B.abd2, tailSwing * 0.8 - 0.05 * (1 - fly) + Math.sin(t * 0.9) * 0.04, Math.sin(t * 1.4 - 1) * 0.06, 0);

    // head: looks about, and keeps the face level while the body pitches
    let yaw = Math.sin(t * 0.41 + this.seed) * 0.3 + Math.sin(t * 0.17) * 0.2;
    let pitch = Math.sin(t * 0.33) * 0.1;
    if (this.lookLocal) {
      yaw = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z), -0.8, 0.8);
      pitch = clamp(-Math.atan2(this.lookLocal.y - 0.09 - alt, Math.hypot(this.lookLocal.x, this.lookLocal.z)), -0.45, 0.35);
    }
    const hy = this.headYaw.update(yaw * (1 - fly * 0.5), dt);
    const hp = this.headPitch.update(pitch + pitchFly * 0.7, dt);
    pose(B.head, hp - bob * 4, hy, Math.sin(t * 0.6) * 0.1 - bank * 0.4);
    if (headAdd) addPose(B.head, headAdd[0], headAdd[1], headAdd[2]);

    // antennae: springs that bob with every lift of the body
    const vy = dt > 0 ? (root.position.y - this.prevY) / dt : 0;
    const ay = dt > 0 ? (vy - this.prevVy) / dt : 0;
    this.prevY = root.position.y;
    this.prevVy = vy;
    const push = clamp(ay * 0.004, -3, 3);
    const aL = this.antL.update(0, dt);
    const aR = this.antR.update(0, dt);
    this.antL.kick(push * dt * 60 * 0.12);
    this.antR.kick(push * dt * 60 * 0.12);
    const sway = this.antS.update(-hy * 0.4, dt);
    const twitch = Math.pow(Math.max(0, Math.sin(t * 0.8 + this.seed)), 16) * Math.sin(t * 18) * 0.12;
    const back = fly * 0.25 + crouch * 0.2;
    pose(B.antL, back + aL * 0.5 + twitch, sway * 0.5, -0.05 + Math.sin(t * 1.2) * 0.04);
    pose(B.antR, back + aR * 0.5 - twitch * 0.6, sway * 0.5, 0.05 - Math.sin(t * 1.2 + 0.7) * 0.04);
    pose(B.antTipL, aL * 0.8 + Math.sin(t * 2.1) * 0.05, 0, 0);
    pose(B.antTipR, aR * 0.8 + Math.sin(t * 2.1 + 1.3) * 0.05, 0, 0);

    // legs: standing when resting, tucked up under the body in flight
    const tuck = Math.max(fly, m.air);
    const reach = this.st === 'landing' ? clamp(1 - alt / 0.08, 0, 1) : 0;
    const legT = tuck * (1 - reach);
    for (const leg of LEGS) {
      const fwd = leg[2];
      const kick = Math.sin(t * 5 + fwd) * 0.08 * legT;
      pose(B[leg[0]], (0.85 - fwd * 0.2) * legT + kick, 0, -0.25 * legT);
      pose(B[leg[1]], (0.85 - fwd * 0.2) * legT - kick, 0, 0.25 * legT);
    }

    // eyes: a happy squint when asked
    this.blinker.hold = squint;
  }

  // Each trick returns what it wants of the body: an altitude (null: leave
  // it), an offset, extra yaw/pitch/roll, a held wing angle, a beat rate
  // (all in this.tp, filled in place).
  trickPose(tr, dt) {
    const t = tr.t;
    const tp = this.tp;
    tp.alt = tp.wing = tp.hz = tp.head = tp.st = null;
    tp.ofs[0] = tp.ofs[1] = tp.ofs[2] = 0;
    tp.yaw = tp.pitch = tp.roll = tp.crouch = tp.squint = 0;
    tp.amp = 1;
    const start = (tr.alt0 ??= this.alt.x);
    const wasDown = (tr.down ??= start < 0.02);
    if (tr.name === 'loop') {
      // anticipation: wings up and a crouch; a burst up; a loop seen side-on
      const base = Math.max(start, 0.15);
      const r = 0.19;
      const load = bump(t, 0, 0.55) * (t < 0.5 ? 1 : 0);
      const up = ramp(t, 0.4, 0.95);
      const k = smooth((t - 0.95) / 1.35);
      const a = k * TAU;
      const turn = smooth((t - 0.5) / 0.4) * (1 - smooth((t - 2.35) / 0.45));
      const yaw = turn * Math.PI * 0.5;
      const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
      const loopOn = t > 0.95 && t < 2.3;
      const ofsF = loopOn ? Math.sin(a) * r : 0;
      const ofsU = loopOn ? (1 - Math.cos(a)) * r : 0;
      if (!tr.fired && t > 0.45) {
        tr.fired = true;
        this.emit('sound', { name: 'loop' });
        this.alt.kick(0.6);
      }
      if (loopOn) {
        tr.trail = (tr.trail ?? 0) - dt;
        if (tr.trail <= 0) {
          tr.trail = 0.09;
          this.emit('sparkle', { at: this.bonePoint('abd2', [0, 0, -0.02]), count: 9, colors: SPARKS, speed: 0.18, up: 0.05, size: 0.022, life: 1.3 });
        }
      }
      if (!tr.giggle && t > 2.4) {
        tr.giggle = true;
        this.emit('sound', { name: 'happy' });
      }
      const end = t > 2.55;
      tp.alt = end && wasDown ? 0 : load > 0 && wasDown ? 0 : base + up * 0.04;
      tp.ofs[0] = fwdX * ofsF;
      tp.ofs[1] = ofsU;
      tp.ofs[2] = fwdZ * ofsF;
      tp.yaw = yaw;
      tp.pitch = -a - load * 0.15;
      tp.wing = load > 0 ? set2(tp.wingAt, 1.35, load) : null;
      tp.hz = loopOn ? 7.5 : t < 0.5 ? null : 6.5;
      tp.crouch = load;
      tp.st = t > 0.4 && !end ? 'flying' : end && wasDown ? 'landing' : null;
      return tp;
    }
    if (tr.name === 'sparkle') {
      // wings close up high, then a fast shivering flutter that shakes off
      // sparkle dust, then a slow flutter down
      const load = t < 0.4 ? bump(t, 0, 0.8) : 0;
      const burst = ramp(t, 0.35, 0.5) * (1 - ramp(t, 2.0, 2.3));
      const hover = wasDown ? 0.16 : start;
      if (!tr.fired && t > 0.38) {
        tr.fired = true;
        this.emit('sound', { name: 'sparkle' });
        this.happy.kick(4);
      }
      if (burst > 0.5) {
        tr.acc = (tr.acc ?? 0) - dt;
        if (tr.acc <= 0) {
          tr.acc = 0.16;
          tr.n = (tr.n ?? 0) + 1;
          const side = tr.n % 2 ? 'foreTipL' : 'foreTipR';
          this.emit('sparkle', { at: this.bonePoint(side, [tr.n % 2 ? 0.06 : -0.06, 0, 0.02]), count: 22, colors: SPARKS, speed: 0.55, up: 0.3, size: 0.026, life: 1.4 });
          if (tr.n % 2 === 0) this.emit('sparkle', { at: this.bonePoint('hindTipL', [0.04, 0, -0.03]), count: 12, colors: SPARKS, speed: 0.45, up: 0.15, size: 0.022 });
          else this.emit('sparkle', { at: this.bonePoint('hindTipR', [-0.04, 0, -0.03]), count: 12, colors: SPARKS, speed: 0.45, up: 0.15, size: 0.022 });
        }
      }
      if (!tr.big && t > 1.9) {
        tr.big = true;
        this.emit('puff', { at: this.bonePoint('thorax', [0, 0.06, 0]), dir: this.bonePoint('thorax', [0, 0.6, 0.2]), colors: SPARKS, count: 80, speed: 1.1, push: 0.8, size: 0.026 });
        this.emit('sound', { name: 'happy' });
      }
      const shimmy = Math.sin(t * 26) * 0.05 * burst;
      tp.alt = t < 0.35 ? (wasDown ? 0 : start) : t > 2.3 && wasDown ? 0 : hover + burst * 0.05;
      tp.roll = shimmy;
      // a pirouette while the dust flies
      tp.yaw = smooth((t - 0.5) / 1.5) * TAU + Math.sin(t * 13) * 0.05 * burst;
      tp.wing = load > 0 ? set2(tp.wingAt, 1.4, load) : null;
      tp.hz = burst > 0.1 ? lerp(6, 10, burst) : null;
      tp.amp = lerp(1, 0.6, burst);
      tp.crouch = load;
      tp.st = t > 0.35 && t < 2.3 ? 'flying' : t >= 2.3 && wasDown ? 'landing' : null;
      return tp;
    }
    if (tr.name === 'flower') {
      // settles as if on a flower (a little hop first if already sitting),
      // squints happily and fans its wings slowly, twice, puffing pollen
      const hop = wasDown ? bump(t, 0.05, 0.6) : 0;
      const sit = ramp(t, 0.6, 0.9) * (1 - clamp(this.alt.x / 0.05, 0, 1));
      const fanK = t > 0.9 && t < 3.3 ? (t - 0.9) / 1.2 : -1;
      let fanA = 0;
      if (fanK >= 0) {
        const cyc = fanK - Math.floor(fanK);
        fanA = Math.pow(Math.sin(cyc * Math.PI), 2);
        const n = Math.floor(fanK);
        if (cyc > 0.45 && (tr.puffs ?? -1) < n) {
          tr.puffs = n;
          this.emit('sparkle', { at: this.bonePoint('thorax', [0, 0.1, 0]), count: 22, colors: POLLEN, speed: 0.28, up: 0.5, size: 0.018, life: 1.6 });
          this.emit('sound', { name: 'fan' });
        }
      }
      if (!tr.fired && t > 0.75) {
        tr.fired = true;
        this.emit('sound', { name: 'flower' });
      }
      // eyes close in bliss as the wings close, and open again with them
      const perch = ramp(t, 0.8, 1.0) * (1 - ramp(t, 3.2, 3.5));
      const squint = perch * Math.min(1, 0.1 + fanA * 0.95);
      // swaying gently, as a flower head does in the breeze
      const sway = sit * (1 - ramp(t, 3.2, 3.6));
      tp.alt = 0;
      tp.ofs[0] = Math.sin(t * 2.2) * 0.006 * sway;
      tp.ofs[1] = hop * 0.035;
      tp.roll = Math.sin(t * 2.2 - 0.6) * 0.09 * sway;
      tp.pitch = Math.sin(t * 1.7) * 0.05 * sway;
      const h = (tp.head = tp.headAt);
      h[0] = -0.2 * perch;
      h[1] = 0;
      h[2] = Math.sin(t * 2) * 0.09 * perch;
      tp.wing = t > 0.6 ? set2(tp.wingAt, 0.12 + fanA * 1.25, sit) : null;
      tp.hz = wasDown ? 7 : 5;
      tp.amp = 0.7;
      tp.crouch = sit * 0.6;
      tp.squint = squint;
      tp.st = t < 0.6 ? (wasDown ? null : 'landing') : 'landing';
      return tp;
    }
    return tp;
  }

  trickLength(name) {
    return { loop: 3.2, sparkle: 2.9, flower: 3.6 }[name] || 2;
  }
}

// ------------------------------------------------------------ calls
// Soft, bright and airy: little flutters of wings, twinkles and whistles.
export const calls = {
  happy(a, t) {
    glide(a, t, [[0, 1500], [0.08, 2150], [0.18, 1850]], { v: 0.062, type: 'sine', formant: 2000, q: 0.9, trill: 24, trillDepth: 0.5 });
    a.bell(2093, 0.036, t + 0.12, 0.6);
    a.bell(2637, 0.03, t + 0.22, 0.7);
  },
  loop(a, t) {
    flaps(a, t, 6, 0.11, 0.05);
    puff(a, t + 0.05, { v: 0.085, from: 450, to: 2400, dur: 0.9 });
    glide(a, t + 0.3, [[0, 950], [0.45, 1900], [0.95, 1250]], { v: 0.058, type: 'sine', formant: 1500, q: 0.8, vibrato: 10 });
  },
  sparkle(a, t) {
    flaps(a, t, 10, 0.08, 0.04);
    [1568, 1760, 2093, 2349, 2637, 3136, 3520].forEach((f, i) => a.bell(f, 0.028, t + 0.05 + i * 0.075, 0.7));
  },
  flower(a, t) {
    glide(a, t, [[0, 1150], [0.22, 1400], [0.65, 950]], { v: 0.045, type: 'sine', formant: 1300, q: 0.7, breath: 0.25 });
    a.bell(1318.5, 0.025, t + 0.45, 1.1);
  },
  fan(a, t) {
    puff(a, t, { v: 0.09, from: 300, to: 760, dur: 0.55 });
  },
};
