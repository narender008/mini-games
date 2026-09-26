// Green sea turtles cruising under the surface.
//
// Each turtle (shell about 0.9 m) glides 1-3 m down with slow, wing-like
// strokes of its long front flippers, the short back flippers steering. Every
// half a minute or so it rises, lifts its head out to breathe for a couple of
// seconds (a ring spreads on the water) and dives again. When the boat comes
// near it banks away and swims off deeper. Turtles that fall far behind the
// boat come back ahead of it, out of sight, so there is usually one to meet.
//
// One lofted mesh (domed carapace over a flat plastron, a blunt head,
// paddle flippers) drawn as one InstancedMesh; the flipper strokes and the
// head lift are rotations about their joints in the vertex shader. The
// fragment shader paints the scutes (radiating olive and gold streaks, pale
// seams, marginal scutes round the rim), the cream plastron, and the scaly
// skin: dark scales edged in cream, domed by a bump.
import * as THREE from 'three';
import { TAU, clamp, damp, rand, angleDiff } from '../config.js';
import { MeshBuilder, profiles, animalMaterial, glslColor, instanced, instanceAttr, place, boatFrame, awayFromLand, headingOf, keepClearOfBoat, tierOf } from './shared.js';

const MAX = 6;

const SHELL = profiles(
  ['w', 'up', 'dn'],
  [
    [0.0, 0.1, 0.035, 0.03],
    [0.04, 0.2, 0.07, 0.045],
    [0.12, 0.29, 0.12, 0.066],
    [0.25, 0.345, 0.158, 0.08],
    [0.4, 0.36, 0.176, 0.085],
    [0.55, 0.346, 0.174, 0.083],
    [0.7, 0.302, 0.15, 0.072],
    [0.82, 0.236, 0.115, 0.055],
    [0.92, 0.15, 0.07, 0.035],
    [0.98, 0.07, 0.035, 0.02],
    [1.0, 0.03, 0.016, 0.012],
  ],
);
const SHELL_Z0 = -0.44;
const SHELL_LEN = 0.9;

const HEAD = profiles(
  ['w', 'up', 'dn', 'y'],
  [
    [0.0, 0.016, 0.013, 0.015, -0.004],
    [0.06, 0.036, 0.033, 0.03, 0.0],
    [0.18, 0.054, 0.05, 0.04, 0.004],
    [0.35, 0.061, 0.056, 0.043, 0.006],
    [0.52, 0.057, 0.05, 0.042, 0.002],
    [0.7, 0.05, 0.045, 0.042, -0.002],
    [1.0, 0.052, 0.048, 0.045, -0.008],
  ],
);
const HEAD_Z0 = -0.61;
const HEAD_LEN = 0.28;

// flipper joints (the +x side; mirrored for the other)
const FRONT = new THREE.Vector3(0.2, -0.03, -0.33);
const REAR = new THREE.Vector3(0.15, -0.03, 0.34);
const NECK = new THREE.Vector3(0, 0.0, -0.37);
const EYE = new THREE.Vector3(0.046, 0.022, -0.545);

function flipper(mb, { root, dir, len, chords, th, part, bend }) {
  const D = dir.clone().normalize();
  const C = new THREE.Vector3(0, 0, 1).addScaledVector(D, -D.z).normalize();
  const side = new THREE.Vector3().crossVectors(C, D).normalize();
  if (side.y < 0) side.negate();
  const sections = chords.map(([u, c], k) => {
    const p = root.clone().addScaledVector(D, u * len).add(new THREE.Vector3(0, -0.02 * u * u, bend * u * u));
    const t = th[0] + (th[1] - th[0]) * (k / (chords.length - 1));
    return { le: p.clone().addScaledVector(C, -c * 0.3), te: p.clone().addScaledVector(C, c * 0.7), th: t, side };
  });
  const m = mb.mark();
  mb.fin({ sections, part, chord: 6, sOf: () => 0 });
  mb.mirrorSince(m);
}

function turtleGeometry(tier) {
  const mb = new MeshBuilder();
  const hi = tier !== 'low';
  mb.loft({
    rings: hi ? 30 : 22,
    segs: hi ? 32 : 24,
    part: 0,
    cluster: 0.7,
    at: (t, o) => {
      o.y = 0;
      o.z = SHELL_Z0 + SHELL_LEN * t;
      o.w = SHELL.w(t);
      o.up = SHELL.up(t);
      o.dn = SHELL.dn(t);
      o.e = 2.15;
      o.e2 = 3.2;
      o.s = t;
    },
  });
  mb.loft({
    rings: hi ? 14 : 10,
    segs: hi ? 16 : 12,
    part: 1,
    cluster: 0.6,
    at: (t, o) => {
      o.y = HEAD.y(t);
      o.z = HEAD_Z0 + HEAD_LEN * t;
      o.w = HEAD.w(t);
      o.up = HEAD.up(t);
      o.dn = HEAD.dn(t);
      o.e = 2.1;
      o.e2 = 2.1;
      o.s = t;
    },
  });
  flipper(mb, {
    root: FRONT.clone().add(new THREE.Vector3(-0.06, 0, 0)),
    dir: new THREE.Vector3(0.8, -0.06, 0.6),
    len: 0.5,
    chords: [
      [-0.12, 0.13],
      [0.02, 0.13],
      [0.2, 0.142],
      [0.4, 0.13],
      [0.6, 0.106],
      [0.77, 0.078],
      [0.89, 0.05],
      [0.96, 0.027],
      [1.0, 0.01],
    ],
    th: [0.2, 0.1],
    part: 2,
    bend: 0.07,
  });
  flipper(mb, {
    root: REAR.clone().add(new THREE.Vector3(-0.04, 0, -0.02)),
    dir: new THREE.Vector3(0.55, -0.08, 0.83),
    len: 0.21,
    chords: [
      [-0.15, 0.09],
      [0.0, 0.092],
      [0.3, 0.1],
      [0.6, 0.09],
      [0.8, 0.07],
      [0.93, 0.044],
      [1.0, 0.014],
    ],
    th: [0.18, 0.1],
    part: 3,
    bend: 0.0,
  });
  return mb.build();
}

const v3 = (v) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;

// Scute centres on the carapace (top view, x >= 0): vertebrals on the
// midline, costals to the side.
const SCUTES = [
  [0, -0.305],
  [0, -0.145],
  [0, 0.02],
  [0, 0.175],
  [0, 0.315],
  [0.2, -0.2],
  [0.225, -0.025],
  [0.205, 0.145],
  [0.14, 0.285],
];

function turtleMaterial() {
  return animalMaterial({
    name: 'turtle',
    bump: true,
    physical: { roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.3, specularIntensity: 0.45 },
    vertex: /* glsl */ `
attribute vec4 aStroke; // stroke phase, front stroke amplitude (rad), head lift (rad), speed of the back flippers
attribute float aSeed;
varying float vSeed;
const vec3 T_FRONT = ${v3(FRONT)};
const vec3 T_REAR = ${v3(REAR)};
const vec3 T_NECK = ${v3(NECK)};
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
`,
    deform: /* glsl */ `
float ph = aStroke.x;
float amp = aStroke.y;
if (aPart > 1.5) {
  float sg = p.x < 0.0 ? -1.0 : 1.0;
  bool front = aPart < 2.5;
  vec3 piv = front ? T_FRONT : T_REAR;
  piv.x *= sg;
  vec3 r = p - piv;
  float w = smoothstep(-0.03, 0.09, abs(r.x));
  float ph2 = front ? ph : ph + 1.3;
  float a = front ? amp : amp * 0.35;
  float elev = w * (a * sin(ph2) - (front ? 0.08 : 0.0));
  float sweep = w * a * (front ? 0.5 : 0.8) * cos(ph2);
  float twist = w * (front ? -0.45 : 0.0) * a * cos(ph2);
  r = rotZ(rotY(rotX(r, twist), sg * sweep), sg * elev);
  n = rotZ(rotY(rotX(n, twist), sg * sweep), sg * elev);
  p = piv + r;
} else if (aPart > 0.5) {
  float w = smoothstep(-0.33, -0.43, p.z);
  float a = w * (aStroke.z + 0.04 * sin(ph + 0.6));
  p = T_NECK + rotX(p - T_NECK, a);
  n = rotX(n, a);
}
`,
    vertexMain: 'vSeed = aSeed;',
    fragment: /* glsl */ `
varying float vSeed;
const vec3 T_BASE = ${glslColor('#5a4a2f')};
const vec3 T_DARK = ${glslColor('#2c2317')};
const vec3 T_GOLD = ${glslColor('#9c7a42')};
const vec3 T_OLIVE = ${glslColor('#555a38')};
const vec3 T_SEAM = ${glslColor('#a49473')};
const vec3 T_PLAST = ${glslColor('#cfbc8c')};
const vec3 T_SCALE = ${glslColor('#3b2e21')};
const vec3 T_EDGE = ${glslColor('#9f8a5e')};
const vec3 T_EYE = ${v3(EYE)};
const vec2 T_SC[${SCUTES.length}] = vec2[](${SCUTES.map(([x, z]) => `vec2(${x.toFixed(3)}, ${z.toFixed(3)})`).join(', ')});
`,
    paint: /* glsl */ `
vec3 p = vRest;
float q = vSurf.y;
vec3 col;
float n1 = anFbm(p * 9.0 + vSeed * 7.0);
if (vPart < 0.5) {
  if (q > 0.0) {
    // carapace: nearest and second nearest scute centre (mirrored across the midline)
    vec2 xz = vec2(abs(p.x), p.z);
    float d1 = 9.0, d2 = 9.0;
    vec2 c1 = vec2(0.0);
    for (int i = 0; i < ${SCUTES.length}; i++) {
      float d = length(xz - T_SC[i]);
      if (d < d1) { d2 = d1; d1 = d; c1 = T_SC[i]; }
      else if (d < d2) d2 = d;
    }
    float seam = 1.0 - smoothstep(0.0012, 0.0035, (d2 - d1) * 0.5 + (n1 - 0.5) * 0.002);
    // irregular streaks radiating from the back of each scute, mottled
    vec2 rel = xz - c1 - vec2(0.0, 0.085);
    float ang = atan(rel.x, rel.y);
    float streak = anNoise(vec3(ang * 3.2 + n1 * 2.5, length(rel) * 7.0, c1.x * 17.0 + c1.y * 29.0 + vSeed * 3.0));
    streak = smoothstep(0.25, 0.85, streak);
    col = mix(T_DARK, T_GOLD, streak * 0.8);
    col = mix(col, T_BASE, 0.5);
    col = mix(col, T_OLIVE, smoothstep(0.45, 0.75, anNoise(p * 11.0 + 3.0)) * 0.4);
    col *= 0.8 + 0.4 * anFbm(p * 24.0);
    // marginal scutes round the rim
    float rim = 1.0 - smoothstep(0.24, 0.3, q);
    float mk = fract(vSurf.x * 11.0 + 0.5);
    float mseam = max(1.0 - smoothstep(0.015, 0.05, min(mk, 1.0 - mk)), 1.0 - smoothstep(0.004, 0.01, abs(q - 0.27)));
    seam = mix(seam, mseam, rim);
    col = mix(col, mix(T_BASE, T_GOLD, 0.25) * (0.8 + 0.4 * n1), rim * 0.35);
    col = mix(col, T_SEAM, seam * mix(0.45, 0.3, rim));
    anBump = -seam * 0.001 + n1 * 0.001;
    anRough = 0.48 + 0.2 * n1;
  } else {
    // plastron: cream, seams down the middle and across
    col = T_PLAST * (0.85 + 0.25 * n1);
    float s1 = 1.0 - smoothstep(0.002, 0.005, abs(p.x));
    col *= 1.0 - 0.25 * s1 * step(q, -0.4);
    col = mix(col, T_BASE * 1.3, smoothstep(-0.25, -0.02, q) * 0.7);
    anRough = 0.55;
    anCoat = 0.5;
  }
} else {
  // skin: dark scales edged in cream, larger on the head and the flipper's leading edge
  vec3 an = abs(vRestN);
  vec2 uv = an.y > max(an.x, an.z) ? p.xz : an.x > an.z ? p.zy : p.xy;
  float size = vPart < 1.5 ? 0.019 : vPart < 2.5 ? 0.024 : 0.018;
  vec3 cells = anCells(uv / size + vSeed * 9.0);
  float edge = 1.0 - smoothstep(0.025, 0.075, cells.x);
  float under = (1.0 - smoothstep(-0.5, 0.0, vRestN.y));
  vec3 sc = mix(T_SCALE, T_BASE * 0.9, cells.y * 0.6);
  sc = mix(sc, T_PLAST * 0.9, under * 0.85);
  col = mix(sc, mix(T_EDGE, T_PLAST, under), edge);
  anBump = smoothstep(0.0, 0.25, cells.x) * 0.0012;
  anRough = 0.5;
  anCoat = 0.35;
  if (vPart < 1.5) {
    // horny beak and dark eyes
    float beak = smoothstep(-0.575, -0.595, p.z);
    col = mix(col, ${glslColor('#7e6d4c')}, beak);
    float de = length(vec3(abs(p.x), p.y, p.z) - T_EYE);
    float eye = 1.0 - smoothstep(0.009, 0.012, de);
    col = mix(col, vec3(0.015, 0.012, 0.01), eye);
    anRough = mix(anRough, 0.05, eye);
    anBump *= 1.0 - eye;
  }
}
diffuseColor.rgb = col * (0.92 + 0.16 * vSeed);
`,
  });
}

// ------------------------------------------------------------ behaviour

const _fr = { along: 0, across: 0 };
const _g = { x: 0, z: 0 };
const _v = new THREE.Vector3();

export class Turtles {
  constructor({ root, quality, world, events }, count) {
    this.world = world;
    this.events = events;
    const tier = tierOf(quality);
    this.n = clamp(Math.round(count), 1, MAX);
    const geo = turtleGeometry(tier);
    this.strokeAttr = instanceAttr(geo, 'aStroke', this.n, 4);
    this.seedAttr = instanceAttr(geo, 'aSeed', this.n, 1);
    this.mat = turtleMaterial();
    this.mesh = instanced(geo, this.mat, this.n, { shadows: quality?.shadows !== false && tier !== 'low', name: 'turtles' });
    root.add(this.mesh);
    this.list = [];
    for (let i = 0; i < this.n; i++) {
      const t = {
        i,
        x: 0,
        z: 0,
        y: -1.5,
        vy: 0,
        heading: Math.random() * TAU,
        goal: Math.random() * TAU,
        speed: 0.4,
        yawRate: 0,
        pitch: 0,
        roll: 0,
        phase: Math.random() * TAU,
        amp: 0.5,
        head: 0,
        mode: 'cruise',
        timer: rand(8, 40),
        depth: rand(1, 2.6),
        scale: rand(0.86, 1.08),
        seed: Math.random(),
        placed: false,
      };
      this.seedAttr.array[i] = t.seed;
      this.list.push(t);
      this.scatter(t);
    }
    this.seedAttr.needsUpdate = true;
  }

  // Anywhere in open, deep enough water (used before the boat is known).
  scatter(t) {
    const b = this.world.bounds;
    for (let k = 0; k < 60; k++) {
      const x = rand(b.minX, b.maxX);
      const z = rand(b.minZ, b.maxZ);
      if (this.ok(x, z)) {
        t.x = x;
        t.z = z;
        t.placed = true;
        return;
      }
    }
  }

  ok(x, z) {
    return this.world.depthAt(x, z) > 2.2 && this.world.landDistance(x, z) > 8;
  }

  // Somewhere ahead of the boat, 40-85 m out.
  respawn(t, boat) {
    for (let k = 0; k < 8; k++) {
      const a = boat.heading + rand(-1.2, 1.2);
      const r = rand(40, 85);
      const x = boat.pos.x - Math.sin(a) * r;
      const z = boat.pos.z - Math.cos(a) * r;
      if (this.ok(x, z)) {
        t.x = x;
        t.z = z;
        t.y = -Math.min(2.2, this.world.depthAt(x, z) - 0.4);
        t.mode = 'cruise';
        t.timer = rand(10, 35);
        t.heading = t.goal = Math.random() * TAU;
        return true;
      }
    }
    return false;
  }

  update(dt, time, boat) {
    const w = this.world;
    const ev = this.events;
    const st = this.strokeAttr.array;
    for (const t of this.list) {
      const bx = t.x - boat.pos.x;
      const bz = t.z - boat.pos.z;
      const dist = Math.hypot(bx, bz);
      if (dist > 120 && t.mode !== 'breathe') this.respawn(t, boat);
      const flee = dist < 12;
      // where to: a slow meander, away from the shore and the boat
      t.goal += Math.sin(time * 0.11 + t.seed * 40) * 0.12 * dt;
      let vx = -Math.sin(t.goal);
      let vz = -Math.cos(t.goal);
      const lx = t.x - Math.sin(t.heading) * 5;
      const lz = t.z - Math.cos(t.heading) * 5;
      const ld = Math.min(w.landDistance(lx, lz), (w.depthAt(lx, lz) - 1.5) * 4);
      if (ld < 8) {
        awayFromLand(w, lx, lz, _g);
        const k = (8 - ld) / 3;
        vx += _g.x * k;
        vz += _g.z * k;
        t.goal = headingOf(vx, vz);
      }
      if (flee && dist > 1e-3) {
        // off the boat's line, the side it is already on
        boatFrame(boat, t.x, t.z, _fr);
        const side = _fr.across >= 0 ? 1 : -1;
        const k = (12 - dist) / 4;
        vx += (bx / dist) * k + Math.cos(boat.heading) * side * k;
        vz += (bz / dist) * k - Math.sin(boat.heading) * side * k;
      }
      const dh = angleDiff(t.heading, headingOf(vx, vz));
      const turn = clamp(dh, -(flee ? 1.1 : 0.45) * dt, (flee ? 1.1 : 0.45) * dt);
      t.heading += turn;
      t.yawRate = damp(t.yawRate, turn / Math.max(dt, 1e-4), 3, dt);
      // vertical
      const maxDepth = Math.max(0.35, w.depthAt(t.x, t.z) - 0.35);
      let target = -Math.min(t.depth, maxDepth);
      let stroke = 0.3;
      let amp = 0.55;
      let cruise = 0.45;
      t.timer -= dt;
      if (flee && (t.mode === 'rise' || t.mode === 'breathe')) {
        t.mode = 'cruise';
        t.depth = rand(2, 2.8);
        t.timer = rand(20, 40);
      }
      if (t.mode === 'cruise') {
        if (t.timer <= 0 && !flee) t.mode = 'rise';
      } else if (t.mode === 'rise') {
        target = -0.16;
        if (t.y > -0.2) {
          t.mode = 'breathe';
          t.timer = rand(2, 3.2);
          ev.ripple(t.x - Math.sin(t.heading) * 0.55 * t.scale, t.z - Math.cos(t.heading) * 0.55 * t.scale, 0.35);
        }
      } else if (t.mode === 'breathe') {
        target = -0.16;
        stroke = 0.14;
        amp = 0.28;
        cruise = 0.18;
        if (t.timer <= 0) {
          t.mode = 'cruise';
          t.depth = rand(1, 2.6);
          t.timer = rand(28, 55);
          ev.ripple(t.x, t.z, 0.25);
        }
      }
      if (flee) {
        stroke = 0.7;
        amp = 0.75;
        cruise = 1.3;
        target = -Math.min(Math.max(t.depth, 2.2), maxDepth);
      }
      const vyWant = clamp((target - t.y) * 0.8, -0.35, 0.3);
      t.vy = damp(t.vy, vyWant, 2, dt);
      t.y = Math.max(t.y + t.vy * dt, -maxDepth);
      // stroke: thrust on the downstroke
      t.phase = (t.phase + TAU * stroke * dt) % (TAU * 1000);
      t.amp = damp(t.amp, amp, 1.5, dt);
      const push = 1 + 0.35 * Math.max(0, -Math.cos(t.phase));
      t.speed = damp(t.speed, cruise, 1.2, dt);
      const sp = t.speed * push;
      t.x -= Math.sin(t.heading) * sp * dt;
      t.z -= Math.cos(t.heading) * sp * dt;
      _v.set(t.x, 0, t.z);
      if (keepClearOfBoat(boat, _v, 1.2)) {
        t.x = _v.x;
        t.z = _v.z;
      }
      t.head = damp(t.head, t.mode === 'breathe' ? 0.42 : 0, 3, dt);
      t.pitch = damp(t.pitch, clamp(Math.atan2(t.vy, Math.max(sp, 0.2)) * 0.8 + (t.mode === 'breathe' ? 0.12 : 0), -0.45, 0.45), 2, dt);
      t.roll = damp(t.roll, clamp(t.yawRate * 0.8, -0.35, 0.35), 2, dt);
      // near the top it rides the swell
      const surf = w.heightAt(t.x, t.z);
      const ride = clamp(1 + t.y / 0.8, 0, 1);
      place(this.mesh, t.i, t.x, t.y + surf * ride, t.z, t.heading, t.pitch, t.roll, t.scale);
      st[t.i * 4] = t.phase;
      st[t.i * 4 + 1] = t.amp;
      st[t.i * 4 + 2] = t.head;
      st[t.i * 4 + 3] = 0;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.strokeAttr.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.material.dispose();
    this.mat.depth.dispose();
    this.mesh.dispose();
  }
}
