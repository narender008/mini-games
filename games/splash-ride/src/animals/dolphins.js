// A pod of bottlenose dolphins that joins the boat now and then.
//
// Every 20-40 s, while the boat runs through open water, two or three
// dolphins (about 2.5 m long) swim in from one side and race alongside, 4-8 m
// off and a little ahead of the bow, matching the boat's speed. Each breathes
// on its own rhythm: a smooth rise until the back and fin break the surface
// (a puff from the blowhole), then down again; at speed the arcs become low
// porpoising leaps, and now and then one makes a clean full leap, 1-1.5 m
// clear, and splashes back in. After 12-20 s, or when the boat stops or nears
// land, they peel off outwards and dive away.
//
// The body is one lofted mesh (rostrum, melon, tapering tail stock with keels,
// falcate dorsal fin, pectoral fins and notched flukes), drawn as one
// InstancedMesh. Swimming is an up-and-down wave driven from the flukes, bent
// in the vertex shader along the spine; in the air the body follows the curve
// of its leap, and in turns it bends into the turn. The skin is painted in the
// fragment shader: dark cape, grey flanks, pale belly, the mouth line, eye and
// blowhole, faint rake marks, under a wet clearcoat.
import * as THREE from 'three';
import { TAU, clamp, lerp, damp, rand, angleDiff } from '../config.js';
import { MeshBuilder, profiles, animalMaterial, glslColor, instanced, instanceAttr, place, hide, boatFrame, keepClearOfBoat, awayFromLand, headingOf, HULL, tierOf } from './shared.js';

const LEN = 2.5; // snout to fluke notch (m)
const NOSE = 1.05; // the snout tip sits at z = -NOSE; the origin is near the centre of mass
const MAX = 3;
const G = 9.81;

// Side profile and girth along the body, as fractions of LEN from the snout:
// height above the axis, depth below it, half width, axis height, and the
// superellipse exponent of the cross-section (below 2 gives the keels of
// the tail stock).
const P = profiles(
  ['up', 'dn', 'w', 'y', 'e'],
  [
    [0.0, 0.016, 0.018, 0.018, -0.06, 2.0],
    [0.01, 0.026, 0.03, 0.03, -0.06, 2.0],
    [0.024, 0.033, 0.04, 0.04, -0.058, 2.1],
    [0.037, 0.038, 0.047, 0.047, -0.055, 2.2],
    [0.047, 0.055, 0.054, 0.056, -0.05, 2.2],
    [0.062, 0.088, 0.066, 0.072, -0.043, 2.3],
    [0.085, 0.122, 0.086, 0.096, -0.034, 2.3],
    [0.12, 0.164, 0.125, 0.136, -0.022, 2.3],
    [0.17, 0.205, 0.171, 0.171, -0.01, 2.3],
    [0.24, 0.238, 0.214, 0.2, 0.0, 2.3],
    [0.32, 0.256, 0.238, 0.216, 0.0, 2.25],
    [0.4, 0.258, 0.242, 0.216, 0.004, 2.2],
    [0.49, 0.243, 0.228, 0.198, 0.008, 2.1],
    [0.58, 0.211, 0.196, 0.164, 0.012, 2.0],
    [0.67, 0.168, 0.151, 0.116, 0.014, 1.9],
    [0.75, 0.129, 0.11, 0.077, 0.014, 1.8],
    [0.82, 0.096, 0.079, 0.049, 0.012, 1.7],
    [0.88, 0.066, 0.052, 0.032, 0.008, 1.7],
    [0.93, 0.044, 0.036, 0.026, 0.005, 1.8],
    [0.97, 0.026, 0.022, 0.02, 0.002, 2.0],
    [1.0, 0.01, 0.008, 0.01, 0.0, 2.0],
  ],
);

const zOf = (sf) => sf * LEN - NOSE;
const sOf = (x, y, z) => (z + NOSE) / LEN;
const backY = (sf) => P.y(sf) + P.up(sf);

// A point on the body surface at sf, at height y (absolute), on the +x side.
function sidePoint(sf, y) {
  const c = P.y(sf);
  const h = y >= c ? P.up(sf) : P.dn(sf);
  const e = P.e(sf);
  const fy = clamp(Math.abs(y - c) / h, 0, 1);
  const fx = Math.pow(Math.max(0, 1 - Math.pow(fy, e)), 1 / e);
  return new THREE.Vector3(P.w(sf) * fx, y, zOf(sf));
}

const EYE = sidePoint(0.104, -0.02);
const BLOW = new THREE.Vector3(0, backY(0.138), zOf(0.138));
const FLIP = sidePoint(0.235, -0.1);

function dolphinGeometry(tier) {
  const mb = new MeshBuilder();
  const rings = tier === 'high' ? 76 : tier === 'medium' ? 60 : 46;
  const segs = tier === 'high' ? 28 : tier === 'medium' ? 22 : 18;
  const chord = tier === 'low' ? 5 : 7;
  // body
  mb.loft({
    rings,
    segs,
    part: 0,
    cluster: 0.85,
    at: (t, o) => {
      o.y = P.y(t);
      o.z = zOf(t);
      o.w = P.w(t);
      o.up = P.up(t);
      o.dn = P.dn(t);
      o.e = P.e(t);
      o.s = t;
    },
  });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // dorsal fin: falcate, rooted along the back (sections follow the back line)
  const H = 0.27;
  const dorsal = [
    [-0.14, 0.418, 0.63, 0.17],
    [0.12, 0.452, 0.612, 0.15],
    [0.32, 0.492, 0.598, 0.135],
    [0.52, 0.528, 0.594, 0.125],
    [0.7, 0.557, 0.6, 0.115],
    [0.84, 0.579, 0.61, 0.11],
    [0.94, 0.598, 0.622, 0.1],
    [1.0, 0.612, 0.628, 0.1],
  ].map(([h, le, te, th]) => ({ le: V(0, backY(le) + h * H, zOf(le)), te: V(0, backY(te) + h * H * 0.96, zOf(te)), th, side: V(1, 0, 0) }));
  mb.fin({ sections: dorsal, part: 1, chord, sOf });
  // pectoral fins: out, down and back from the lower flank
  const root = sidePoint(0.238, -0.1);
  root.x *= 0.7;
  const D = V(0.6, -0.36, 0.58).normalize();
  const len = 0.4;
  const C = V(0, 0, 1).addScaledVector(D, -D.z).normalize();
  const side = new THREE.Vector3().crossVectors(C, D).normalize();
  if (side.y < 0) side.negate();
  const pect = [
    [-0.18, 0.15, 0.22],
    [0.05, 0.148, 0.2],
    [0.3, 0.136, 0.17],
    [0.55, 0.112, 0.15],
    [0.75, 0.084, 0.14],
    [0.88, 0.058, 0.13],
    [0.96, 0.034, 0.12],
    [1.0, 0.014, 0.12],
  ].map(([u, c, th]) => {
    const p = root.clone().addScaledVector(D, u * len).add(V(0, -0.02 * u * u, 0.07 * u * u));
    return { le: p.clone().addScaledVector(C, -c * 0.32), te: p.clone().addScaledVector(C, c * 0.68), th, side };
  });
  let m = mb.mark();
  mb.fin({ sections: pect, part: 2, chord, sOf });
  mb.mirrorSince(m);
  // flukes: one half, mirrored; the halves meet on the midline inside the tail stock
  const span = 0.31;
  const fluke = [
    [0.0, 0.906, 0.99, 0.2],
    [0.12, 0.911, 1.0, 0.17],
    [0.28, 0.922, 1.007, 0.14],
    [0.45, 0.94, 1.009, 0.12],
    [0.62, 0.962, 1.01, 0.11],
    [0.78, 0.985, 1.014, 0.1],
    [0.9, 1.003, 1.02, 0.1],
    [0.97, 1.017, 1.026, 0.1],
    [1.0, 1.026, 1.03, 0.1],
  ].map(([u, le, te, th]) => ({ le: V(u * span, 0.004 + 0.012 * u * u, zOf(le)), te: V(u * span, 0.004 + 0.012 * u * u, zOf(te)), th, side: V(0, 1, 0) }));
  m = mb.mark();
  mb.fin({ sections: fluke, part: 3, chord, sOf });
  mb.mirrorSince(m);
  return mb.build();
}

const v3 = (v) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;

function dolphinMaterial() {
  return animalMaterial({
    name: 'dolphin',
    physical: {
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.16,
      specularIntensity: 0.45,
      envMapIntensity: 0.85,
    },
    vertex: /* glsl */ `
attribute vec4 aSwim; // tail-beat phase, fluke amplitude (m), leap arc curvature (1/m), turn curvature (1/m)
attribute float aSeed;
varying float vSeed;
#define D_LEN ${LEN.toFixed(3)}
#define D_NOSE ${NOSE.toFixed(3)}
// the spine's height at s (m from the snout): a wave growing towards the
// flukes, the flukes pitching ahead of the beat, and the curve of a leap
float dSpineY(float s) {
  float e = smoothstep(0.24 * D_LEN, D_LEN, s);
  float env = e * e * (0.4 + 0.6 * e);
  float head = (1.0 - smoothstep(0.0, 0.35 * D_LEN, s)) * 0.1;
  float ph = aSwim.x - 4.2 * s / D_LEN;
  float sp = 0.885 * D_LEN;
  float pitch = aSwim.y * 2.4 * cos(aSwim.x - 4.2 * 0.885) * (s - sp) * smoothstep(sp - 0.06, sp + 0.08, s);
  float c = s - D_NOSE;
  return aSwim.y * (env - head) * sin(ph) + pitch + 0.5 * aSwim.z * c * c;
}
float dSpineX(float s) {
  float c = s - D_NOSE;
  return 0.5 * aSwim.w * c * c;
}
`,
    deform: /* glsl */ `
float s = p.z + D_NOSE;
const float E = 0.01;
float y0 = dSpineY(s);
float sy = (dSpineY(s + E) - dSpineY(s - E)) / (2.0 * E);
float l = sqrt(1.0 + sy * sy);
vec3 q = vec3(p.x, y0 + p.y / l, p.z - p.y * sy / l);
vec3 m = vec3(n.x, (n.z * sy + n.y) / l, (n.z - n.y * sy) / l);
float x0 = dSpineX(s);
float sx = (dSpineX(s + E) - dSpineX(s - E)) / (2.0 * E);
float lx = sqrt(1.0 + sx * sx);
p = vec3(x0 + q.x / lx, q.y, q.z - q.x * sx / lx);
n = vec3((m.z * sx + m.x) / lx, m.y, (m.z - m.x * sx) / lx);
`,
    vertexMain: 'vSeed = aSeed;',
    fragment: /* glsl */ `
varying float vSeed;
#define D_LEN ${LEN.toFixed(3)}
#define D_NOSE ${NOSE.toFixed(3)}
const vec3 D_CAPE = ${glslColor('#3a4047')};
const vec3 D_FLANK = ${glslColor('#7d858d')};
const vec3 D_BELLY = ${glslColor('#d3cfcb')};
const vec3 D_FIN = ${glslColor('#343a41')};
const vec3 D_EYE = ${v3(EYE)};
const vec3 D_BLOW = ${v3(BLOW)};
const vec3 D_FLIP = ${v3(FLIP)};
float segDist(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * t);
}
`,
    paint: /* glsl */ `
vec3 p = vRest;
float sn = vSurf.x;
float q = vSurf.y;
float n1 = anFbm(p * 3.2 + vSeed * 13.0);
float n2 = anNoise(p * 38.0);
vec3 flank = mix(D_FLANK, D_CAPE * 1.25, smoothstep(0.62, 0.95, sn));
vec3 col;
if (vPart < 0.5) {
  // the dark cape dips lowest in front of the dorsal fin
  float capeQ = 0.6 - 0.3 * smoothstep(0.14, 0.42, sn) + 0.34 * smoothstep(0.55, 0.9, sn);
  float capeW = 0.09 + 0.1 * smoothstep(0.45, 0.9, sn);
  float cape = smoothstep(capeQ - capeW, capeQ + capeW, q + (n1 - 0.5) * 0.14);
  cape *= 1.0 - smoothstep(0.03, 0.07, 0.1 - sn) ;
  float bellyQ = mix(-0.02, -0.4, smoothstep(0.1, 0.3, sn));
  bellyQ = mix(bellyQ, -1.3, smoothstep(0.6, 0.8, sn));
  float belly = 1.0 - smoothstep(bellyQ - 0.1, bellyQ + 0.1, q + (n1 - 0.5) * 0.12);
  col = mix(flank, D_CAPE, cape);
  // melon and rostrum a mid grey, a little darker at the tip
  col = mix(col, D_FLANK * 0.82, (1.0 - smoothstep(0.06, 0.1, sn)) * (1.0 - belly));
  col = mix(col, D_BELLY, belly);
  // lower jaw pale below the mouth line, which curves up into a smile
  float mouthY = -0.058 + 0.016 * smoothstep(0.045, 0.09, sn);
  float jaw = smoothstep(0.003, -0.004, p.y - mouthY) * (1.0 - smoothstep(0.075, 0.12, sn));
  col = mix(col, D_BELLY * 0.92, jaw);
  float mouth = (1.0 - smoothstep(0.0012, 0.0035, abs(p.y - mouthY))) * (1.0 - smoothstep(0.086, 0.094, sn)) * step(0.003, sn);
  col *= 1.0 - 0.6 * mouth;
  // a soft dark band from the eye back to the flipper
  vec3 pa = vec3(abs(p.x), p.y, p.z);
  float band = 1.0 - smoothstep(0.015, 0.05, segDist(pa, D_EYE, D_FLIP));
  col *= 1.0 - 0.16 * band;
  // eye: a dark wet bead in a darker patch
  float de = length(pa - D_EYE);
  col *= 1.0 - 0.3 * (1.0 - smoothstep(0.012, 0.035, de));
  float eye = 1.0 - smoothstep(0.0085, 0.0115, de);
  col = mix(col, vec3(0.012, 0.011, 0.012), eye);
  anRough = mix(anRough, 0.06, eye);
  // blowhole: a crescent with its horns forward
  vec3 pb = p - D_BLOW;
  float cres = (1.0 - smoothstep(0.0018, 0.0042, abs(pb.z + 26.0 * pb.x * pb.x))) * (1.0 - smoothstep(0.014, 0.019, abs(pb.x))) * step(-0.03, pb.y);
  col = mix(col, vec3(0.02), cres * 0.85);
  // faint pale rake marks, a few parallel scratches here and there
  vec2 ru = vec2(p.z * 7.0, q * 2.2 + p.x * 3.0) + vSeed * 5.0;
  vec2 rc = floor(ru);
  vec2 rf = fract(ru) - 0.5;
  float rh = anHash2(rc);
  float ang = anHash2(rc + 3.1) * 3.1416;
  vec2 dir = vec2(cos(ang), sin(ang));
  float across = dot(rf, vec2(-dir.y, dir.x));
  float along = dot(rf, dir);
  float lines = smoothstep(0.55, 0.95, abs(sin(across * 44.0))) * (1.0 - smoothstep(0.1, 0.3, abs(along))) * (1.0 - smoothstep(0.12, 0.2, abs(across)));
  col *= 1.0 + 0.16 * lines * step(0.72, rh) * (1.0 - belly);
} else if (vPart < 1.5) {
  col = mix(D_CAPE, D_FIN, smoothstep(0.1, 0.5, vSurf.z));
} else if (vPart < 2.5) {
  vec3 under = mix(D_FLANK * 0.8, D_FIN * 1.4, 0.4);
  col = mix(under, D_FIN, step(0.0, q));
  col = mix(flank, col, smoothstep(0.05, 0.3, vSurf.z));
} else {
  vec3 under = mix(D_FLANK * 0.85, D_FIN, 0.35);
  col = mix(under, D_FIN, step(0.0, q));
}
// skin: gentle mottling, fine speckle, each dolphin its own shade
col *= (0.93 + 0.14 * n1) * (0.97 + 0.06 * n2) * (0.94 + 0.12 * vSeed);
diffuseColor.rgb = col;
anRough = clamp(anRough + (n1 - 0.5) * 0.12, 0.04, 0.6);
`,
  });
}

// ------------------------------------------------------------ behaviour

class Dolphin {
  constructor(i) {
    this.i = i;
    this.active = false;
    this.x = 0;
    this.z = 0;
    this.y = -2; // centre height relative to the local water surface
    this.vy = 0;
    this.heading = 0;
    this.speed = 0;
    this.yawRate = 0;
    this.pitch = 0;
    this.roll = 0;
    this.scale = 1;
    this.phase = Math.random() * TAU;
    this.amp = 0.08;
    this.arc = 0;
    this.turn = 0;
    this.slot = { lat: 5, ahead: 3 };
    this.vmode = 'swim';
    this.lphase = 'up';
    this.vt = 0;
    this.vdur = 2;
    this.depth = 1.2;
    this.y0 = -1;
    this.peak = 0;
    this.vy0 = 5.4;
    this.blown = false;
    this.broke = false;
    this.near = false;
    this.wy = 0; // world height, for events
  }
}

const SLOTS = [
  { lat: 5.2, ahead: 4.6 },
  { lat: 6.9, ahead: 2.6 },
  { lat: 4.5, ahead: 0.9 },
];

const _fr = { along: 0, across: 0 };
const _g = { x: 0, z: 0 };
const _v = new THREE.Vector3();

export class Dolphins {
  constructor({ root, quality, world, events }) {
    this.world = world;
    this.events = events;
    const tier = tierOf(quality);
    const geo = dolphinGeometry(tier);
    this.swimAttr = instanceAttr(geo, 'aSwim', MAX, 4);
    this.seedAttr = instanceAttr(geo, 'aSeed', MAX, 1);
    this.mat = dolphinMaterial();
    this.mesh = instanced(geo, this.mat, MAX, { shadows: quality?.shadows !== false && tier !== 'low', name: 'dolphins' });
    this.mesh.visible = false;
    root.add(this.mesh);
    this.pod = [];
    for (let i = 0; i < MAX; i++) this.pod.push(new Dolphin(i));
    this.state = 'away';
    this.timer = rand(9, 15);
    this.side = 1;
    this.slow = 0;
    this.check = 0;
    this.leapCool = 3;
    this.greeted = false;
    this.leaveX = 0;
    this.leaveZ = -1;
  }

  // Deep, open water along the boat's way?
  openAhead(boat, clearance) {
    const w = this.world;
    const fx = -Math.sin(boat.heading);
    const fz = -Math.cos(boat.heading);
    for (const d of [0, 15, 30]) {
      const x = boat.pos.x + fx * d;
      const z = boat.pos.z + fz * d;
      if (w.landDistance(x, z) < clearance || w.depthAt(x, z) < 2.5) return false;
    }
    return true;
  }

  sideOpen(boat, side) {
    const w = this.world;
    const h = boat.heading;
    const x = boat.pos.x + Math.cos(h) * side * 22 - Math.sin(h) * 8;
    const z = boat.pos.z - Math.sin(h) * side * 22 - Math.cos(h) * 8;
    return Math.min(w.landDistance(x, z), w.depthAt(x, z) > 2.5 ? 1e9 : -1);
  }

  canJoin(boat) {
    return boat.speed > 3.5 && this.openAhead(boat, 15) && Math.max(this.sideOpen(boat, 1), this.sideOpen(boat, -1)) > 8;
  }

  // Bring the pod in now (also used by the test page). side: 1 right, -1 left.
  join(boat, side) {
    const r = this.sideOpen(boat, 1);
    const l = this.sideOpen(boat, -1);
    this.side = side || (r >= l ? 1 : -1);
    const n = Math.random() < 0.6 ? 3 : 2;
    const h = boat.heading;
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    const rx = Math.cos(h) * this.side;
    const rz = -Math.sin(h) * this.side;
    for (const d of this.pod) {
      d.active = d.i < n;
      if (!d.active) {
        hide(this.mesh, d.i);
        continue;
      }
      const s = SLOTS[d.i];
      d.slot.lat = s.lat + rand(-0.4, 0.4);
      d.slot.ahead = s.ahead + rand(-0.5, 0.5);
      d.x = boat.pos.x + rx * (22 + d.i * 2.5) + fx * (9 - d.i * 3);
      d.z = boat.pos.z + rz * (22 + d.i * 2.5) + fz * (9 - d.i * 3);
      d.heading = h + this.side * 0.5;
      d.speed = boat.speed + 3;
      d.y = -1.7;
      d.vy = 0;
      d.pitch = 0;
      d.vmode = 'swim';
      d.vt = 0;
      d.vdur = 0.6 + d.i * 1.3;
      d.depth = 1.6;
      d.near = false;
      d.scale = rand(0.93, 1.06);
      this.seedAttr.array[d.i] = Math.random();
    }
    this.seedAttr.needsUpdate = true;
    this.state = 'with';
    this.timer = rand(12, 20);
    this.slow = 0;
    this.check = 0;
    this.leapCool = rand(2.5, 5);
    this.greeted = false;
    this.mesh.visible = true;
  }

  leave(boat) {
    this.state = 'leaving';
    this.timer = 7;
    const h = boat.heading;
    const a = 0.75;
    // outwards and onwards, away from the boat's side
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    const rx = Math.cos(h) * this.side;
    const rz = -Math.sin(h) * this.side;
    this.leaveX = fx * Math.cos(a) + rx * Math.sin(a);
    this.leaveZ = fz * Math.cos(a) + rz * Math.sin(a);
    for (const d of this.pod) {
      if (!d.active) continue;
      d.depth = 3.2;
      if (d.vmode === 'arc') {
        d.vmode = 'swim';
        d.vt = 0;
      }
    }
  }

  update(dt, time, boat) {
    if (this.state === 'away') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.canJoin(boat)) this.join(boat);
        else this.timer = 1.2;
      }
      return;
    }
    if (this.state === 'with') {
      this.timer -= dt;
      this.slow = boat.speed < 2.5 ? this.slow + dt : 0;
      this.check -= dt;
      let go = this.timer <= 0 || this.slow > 1.5;
      if (this.check <= 0) {
        this.check = 0.4;
        if (!this.openAhead(boat, 12)) go = true;
      }
      if (go) this.leave(boat);
    } else if (this.state === 'leaving') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'away';
        this.timer = rand(20, 40);
        this.mesh.visible = false;
        for (const d of this.pod) {
          d.active = false;
          hide(this.mesh, d.i);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        return;
      }
    }
    this.leapCool -= dt;
    const sw = this.swimAttr.array;
    for (const d of this.pod) {
      if (!d.active) continue;
      this.steer(d, dt, time, boat);
      this.breathe(d, dt, boat);
      place(this.mesh, d.i, d.x, d.wy, d.z, d.heading, d.pitch, d.roll, d.scale);
      sw[d.i * 4] = d.phase;
      sw[d.i * 4 + 1] = d.amp;
      sw[d.i * 4 + 2] = d.arc;
      sw[d.i * 4 + 3] = d.turn;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.swimAttr.needsUpdate = true;
  }

  // Horizontal: keep station beside the bow (or head away), clear of the
  // hull, each other and the shore.
  steer(d, dt, time, boat) {
    const w = this.world;
    const h = boat.heading;
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    let vx;
    let vz;
    if (this.state === 'with') {
      const lat = d.slot.lat + 0.7 * Math.sin(time * 0.23 + d.i * 2.1);
      const ahead = d.slot.ahead + 1.1 * Math.sin(time * 0.17 + d.i * 1.3);
      const tx = boat.pos.x + fx * ahead + rx * this.side * lat;
      const tz = boat.pos.z + fz * ahead + rz * this.side * lat;
      const ex = tx - d.x;
      const ez = tz - d.z;
      d.near = ex * ex + ez * ez < 100;
      vx = boat.vel.x + ex * 0.75;
      vz = boat.vel.z + ez * 0.75;
    } else {
      const sp = Math.max(boat.speed * 0.85, 6);
      vx = this.leaveX * sp;
      vz = this.leaveZ * sp;
    }
    // stay well out to the side of the hull
    boatFrame(boat, d.x, d.z, _fr);
    const clear = 3.8;
    if (_fr.along > -HULL.half - 4 && _fr.along < HULL.half + 5 && Math.abs(_fr.across) < clear) {
      const push = (clear - Math.abs(_fr.across)) * 5 * (_fr.across >= 0 ? 1 : -1);
      vx += rx * push;
      vz += rz * push;
    }
    // and a body length or so apart
    for (const o of this.pod) {
      if (o === d || !o.active) continue;
      const dx = d.x - o.x;
      const dz = d.z - o.z;
      const dd = dx * dx + dz * dz;
      if (dd < 7 && dd > 1e-6) {
        const k = (Math.sqrt(7) - Math.sqrt(dd)) * 2.5 / Math.sqrt(dd);
        vx += dx * k;
        vz += dz * k;
      }
    }
    // away from the shore
    const lx = d.x - Math.sin(d.heading) * 6;
    const lz = d.z - Math.cos(d.heading) * 6;
    const ld = w.landDistance(lx, lz);
    if (ld < 10) {
      awayFromLand(w, lx, lz, _g);
      const k = (10 - ld) * 1.6;
      vx += _g.x * k;
      vz += _g.z * k;
    }
    const want = clamp(Math.hypot(vx, vz), 1.5, Math.max(6, boat.speed + 5));
    const dh = angleDiff(d.heading, headingOf(vx, vz));
    const maxTurn = 1.6 * dt;
    const step = clamp(dh, -maxTurn, maxTurn);
    d.heading += step;
    d.yawRate = damp(d.yawRate, step / Math.max(dt, 1e-4), 5, dt);
    const acc = (want > d.speed ? 4 : 5) * dt;
    d.speed += clamp(want - d.speed, -acc, acc);
    d.x -= Math.sin(d.heading) * d.speed * dt;
    d.z -= Math.cos(d.heading) * d.speed * dt;
    _v.set(d.x, 0, d.z);
    if (keepClearOfBoat(boat, _v, 1.8)) {
      d.x = _v.x;
      d.z = _v.z;
    }
    d.roll = damp(d.roll, clamp(d.yawRate * 0.45, -0.5, 0.5), 4, dt);
    d.turn = damp(d.turn, clamp(-d.yawRate / Math.max(d.speed, 2), -0.3, 0.3), 5, dt);
  }

  // Vertical: swim, rise to breathe, porpoise, leap.
  breathe(d, dt, boat) {
    const w = this.world;
    const ev = this.events;
    const surf = w.heightAt(d.x, d.z);
    const maxDepth = Math.max(0.45, w.depthAt(d.x, d.z) - 0.6);
    d.vt += dt;
    const was = d.y;
    let y = d.y;
    let inAir = false;
    if (d.vmode === 'swim') {
      y = damp(y, -Math.min(d.depth, maxDepth), 1.6, dt);
      d.vy = (y - was) / Math.max(dt, 1e-4);
      if (d.vt > d.vdur && this.state === 'with' && d.near) this.nextBreath(d, boat, maxDepth);
    } else if (d.vmode === 'arc') {
      const u = Math.min(1, d.vt / d.vdur);
      const b = 0.5 - 0.5 * Math.cos(TAU * u);
      y = lerp(u < 0.5 ? d.y0 : -Math.min(d.depth, maxDepth), d.peak, b);
      d.vy = (y - was) / Math.max(dt, 1e-4);
      if (!d.broke && y > -0.22 && d.vy > 0) {
        d.broke = true;
        ev.ripple(d.x, d.z, clamp(0.25 + boat.speed * 0.02, 0.25, 0.5));
        if (d.peak > 0.26) ev.splash(_v.set(d.x, surf, d.z), 0.28);
      }
      if (!d.blown && u >= 0.5) {
        d.blown = true;
        if (d.peak > -0.06) {
          ev.blow(this.blowhole(d, _v));
          if (!this.greeted) {
            this.greeted = true;
            ev.sound('dolphin', _v);
          }
        }
        if (d.peak > 0.26) d.broke = false; // re-entry splash below
      }
      if (d.blown && d.peak > 0.26 && !d.broke && y < -0.05 && d.vy < 0) {
        d.broke = true;
        ev.splash(_v.set(d.x, surf, d.z), 0.32);
      }
      if (u >= 1) {
        d.vmode = 'swim';
        d.vt = 0;
        d.vdur = rand(0.8, 2.6) * (boat.speed > 8 ? 0.8 : 1.2);
      }
    } else {
      // a full leap
      const vh = Math.max(d.speed, 3);
      if (d.lphase === 'up') {
        const Tu = 0.85;
        const t = Math.min(1, d.vt / Tu);
        const h00 = 2 * t * t * t - 3 * t * t + 1;
        const h11 = t * t * t - t * t;
        y = h00 * d.y0 + h11 * Tu * d.vy0;
        d.vy = ((6 * t * t - 6 * t) * d.y0 + (3 * t * t - 2 * t) * Tu * d.vy0) / Tu;
        if (t >= 1) {
          d.lphase = 'air';
          d.vy = d.vy0;
          y = 0;
          ev.splash(_v.set(d.x, surf, d.z), 0.5);
          ev.sound('dolphin', _v);
        }
      } else if (d.lphase === 'air') {
        inAir = true;
        d.vy -= G * dt;
        y += d.vy * dt;
        if (y < 0 && d.vy < 0) {
          d.lphase = 'down';
          ev.splash(_v.set(d.x - Math.sin(d.heading) * 0.6, surf, d.z - Math.cos(d.heading) * 0.6), 0.85);
        }
      } else {
        d.vy = damp(d.vy, 0, 2.4, dt);
        y += d.vy * dt;
        if (d.vy > -0.35 || y < -maxDepth) {
          d.vmode = 'swim';
          d.vt = 0;
          d.vdur = rand(1.5, 3);
          d.depth = clamp(-y, 0.8, 1.6);
        }
      }
      d.arc = damp(d.arc, inAir ? -clamp((G * vh) / Math.pow(vh * vh + d.vy * d.vy, 1.5), 0, 0.2) : 0, inAir ? 20 : 6, dt);
    }
    if (d.vmode !== 'leap') d.arc = damp(d.arc, 0, 6, dt);
    if (y < -maxDepth && !inAir) y = Math.min(was, -maxDepth);
    d.y = y;
    d.wy = surf + y;
    // nose follows the path; exactly so in the air
    const pitch = clamp(Math.atan2(d.vy, Math.max(d.speed, 3)), -1.1, 1.1);
    d.pitch = inAir ? pitch : damp(d.pitch, pitch, 10, dt);
    // fluke beat: faster and stronger with speed, hard on the way up to a leap, held still in the air
    const hard = d.vmode === 'leap' && d.lphase === 'up';
    const freq = hard ? 3 : clamp(0.7 + d.speed * 0.16, 0.8, 2.8);
    const amp = inAir ? 0.012 : hard ? 0.16 : clamp(0.045 + d.speed * 0.006, 0.05, 0.13);
    d.amp = damp(d.amp, amp, inAir ? 8 : 3, dt);
    d.phase = (d.phase + TAU * freq * dt * (inAir ? 0.25 : 1)) % (TAU * 100);
  }

  nextBreath(d, boat, maxDepth) {
    d.vt = 0;
    d.y0 = d.y;
    d.blown = false;
    d.broke = false;
    if (this.leapCool <= 0 && boat.speed > 4.5 && maxDepth > 1.8 && Math.random() < 0.3) {
      this.leapCool = rand(5, 9);
      d.vmode = 'leap';
      d.lphase = 'up';
      d.y0 = Math.min(d.y, -1.1);
      d.vy0 = rand(5.2, 5.8);
      return;
    }
    d.vmode = 'arc';
    const fast = boat.speed > 7;
    d.peak = fast ? rand(0.1, 0.42) : rand(-0.02, 0.1);
    d.vdur = clamp(2.8 - boat.speed * 0.1, 1.3, 2.4) * rand(0.9, 1.1);
    d.depth = rand(0.8, 1.3);
  }

  blowhole(d, out) {
    const k = 0.72 * d.scale;
    const cp = Math.cos(d.pitch);
    return out.set(d.x - Math.sin(d.heading) * k * cp, d.wy + 0.17 * d.scale + Math.sin(d.pitch) * k + 0.05, d.z - Math.cos(d.heading) * k * cp);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.material.dispose();
    this.mat.depth.dispose();
    this.mesh.dispose();
  }
}

// For the test page: the rest-pose geometry facts.
export const DOLPHIN = { LEN, NOSE };
