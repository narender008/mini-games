// Little winged things for the garden. Butterflies flutter from flower to
// flower in a wandering, bobbing flight, settle on a bloom and slowly open
// and close their wings; dragonflies hover over the pond, dart, and dip the
// tip of the tail in the water (a ripple ring spreads). They are smaller and
// plainer than the butterfly friend a child paints, which is bigger and
// glossier.
//
// Each kind is one InstancedMesh whose wings are flapped in the vertex
// shader from a per-insect angle, so all of them cost two draw calls.
// Butterfly wings are patterned in the fragment shader from where a point
// is on the wing (how far from the root, how far round the edge): a soft
// inner colour, an outer colour, a dark border with pale spots.
import * as THREE from 'three';
import { rand, clamp, damp, angleDiff, TAU, REDUCED_MOTION } from '../config.js';
import { POND, WATER_Y } from './world.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();

const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------ geometry helpers

function acc() {
  return { pos: [], nor: [], uv: [], part: [], col: [], idx: [] };
}

function push(a, geo, part, colorFn = () => [0.05, 0.03, 0.02]) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const base = a.pos.length / 3;
  for (let i = 0; i < p.count; i++) {
    a.pos.push(p.getX(i), p.getY(i), p.getZ(i));
    a.nor.push(n.getX(i), n.getY(i), n.getZ(i));
    a.uv.push(0, 0);
    a.part.push(part);
    a.col.push(...colorFn(p.getX(i), p.getY(i), p.getZ(i)));
  }
  for (let i = 0; i < geo.index.count; i++) a.idx.push(base + geo.index.getX(i));
}

function ellipsoid(a, c, r, part, colorFn, w = 12, h = 8) {
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
  push(a, g, part, colorFn);
}

function finish(a, extra = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(a.part, 1));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(a.col, 3));
  g.setIndex(a.idx);
  return g;
}

// ------------------------------------------------------------ butterflies

// wing outlines (x out, z forward), drawn as a fan from a point near the body
const FORE = { root: [0.003, 0.002], edge: [[0.004, 0.012], [0.018, 0.027], [0.036, 0.035], [0.05, 0.033], [0.058, 0.023], [0.06, 0.009], [0.052, -0.004], [0.038, -0.012], [0.022, -0.014], [0.008, -0.008]] };
const HIND = { root: [0.003, -0.01], edge: [[0.004, -0.008], [0.02, -0.011], [0.034, -0.02], [0.04, -0.034], [0.034, -0.049], [0.022, -0.047], [0.01, -0.037], [0.003, -0.023]] };

function butterflyGeometry() {
  const a = acc();
  const dark = () => [0.045, 0.03, 0.022];
  ellipsoid(a, [0, 0, 0.004], [0.0048, 0.0048, 0.011], 0, dark);
  ellipsoid(a, [0, 0, -0.022], [0.0036, 0.0036, 0.02], 0, dark);
  ellipsoid(a, [0, 0.0005, 0.0165], [0.0046, 0.0046, 0.0046], 0, dark);
  for (const s of [-1, 1]) {
    // antennae: thin, swept forward and out, with a small club
    const g = new THREE.CylinderGeometry(0.0004, 0.0006, 0.026, 4, 1);
    g.translate(0, 0.013, 0);
    g.rotateZ(-s * 0.5);
    g.rotateX(1.15);
    g.translate(s * 0.002, 0.002, 0.018);
    push(a, g, 0, dark);
    ellipsoid(a, [s * 0.0125, 0.0225, 0.0285], [0.0011, 0.0011, 0.0016], 0, dark, 6, 4);
  }
  // wings: rings from the root out to the edge, the rim lifted a little
  for (const [kind, W] of [[1, FORE], [2, HIND]]) {
    for (const mirror of [false, true]) {
      const N = W.edge.length;
      const R = 3;
      const pos = [];
      const uv = [];
      const idx = [];
      for (let j = 0; j <= R; j++)
        for (let i = 0; i < N; i++) {
          const r = j / R;
          const x = W.root[0] + (W.edge[i][0] - W.root[0]) * r;
          const z = W.root[1] + (W.edge[i][1] - W.root[1]) * r;
          pos.push(mirror ? -x : x, 0.006 * r * r, z);
          uv.push(r, i / (N - 1));
        }
      for (let j = 0; j < R; j++)
        for (let i = 0; i < N - 1; i++) {
          const p0 = j * N + i, p1 = p0 + 1, p2 = p0 + N, p3 = p2 + 1;
          idx.push(p0, p2, p1, p1, p2, p3);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const base = a.pos.length / 3;
      const nrm = g.attributes.normal;
      for (let i = 0; i < pos.length / 3; i++) {
        a.pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        a.nor.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        a.uv.push(uv[i * 2], uv[i * 2 + 1]);
        a.part.push(kind);
        a.col.push(0, 0, 0);
      }
      for (const k of idx) a.idx.push(base + k);
    }
  }
  return finish(a);
}

const BUTTERFLY_VERT = /* glsl */ `
attribute vec2 aUv;
attribute float aPart;
attribute vec3 aCol;
attribute float aFlap;
uniform vec3 uCA[8];
uniform vec3 uCB[8];
varying vec2 vUvW;
varying float vPart;
varying vec3 vCA;
varying vec3 vCB;
varying vec3 vFix;
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
`;

const BUTTERFLY_POSE = /* glsl */ `
vec3 bp = position;
vec3 bn = objectNormal;
if (aPart > 0.5) {
  float side = position.x > 0.0 ? 1.0 : -1.0;
  // the forewing leads the flap, the hindwing follows a beat behind
  float a = aFlap * (aPart > 1.5 ? 0.9 : 1.0);
  mat3 R = rotZ(side * a);
  bp = R * position;
  bn = R * bn;
}
`;

function butterflyMaterial(ca, cb) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uCA = { value: ca };
    s.uniforms.uCB = { value: cb };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${BUTTERFLY_VERT}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${BUTTERFLY_POSE}\nobjectNormal = normalize(bn);`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = bp;\nvUvW = aUv;\nvPart = aPart;\nvCA = uCA[gl_InstanceID];\nvCB = uCB[gl_InstanceID];\nvFix = aCol;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUvW;\nvarying float vPart;\nvarying vec3 vCA;\nvarying vec3 vCB;\nvarying vec3 vFix;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vPart < 0.5) diffuseColor.rgb = vFix;
        else {
          float r = vUvW.x;
          float t = vUvW.y;
          vec3 c = mix(vCA, vCB, smoothstep(0.3, 0.78, r));
          // fine veins running out from the body
          c *= 0.9 + 0.1 * sin(t * 46.0 + r * 3.0);
          float border = smoothstep(0.8, 0.92, r);
          c = mix(c, vec3(0.035, 0.024, 0.02), border * 0.92);
          float dots = smoothstep(0.085, 0.045, length(vec2(fract(t * 5.0 + 0.5) - 0.5, (r - 0.87) * 3.4)));
          c = mix(c, vec3(1.0, 0.96, 0.88), dots * border);
          diffuseColor.rgb = c;
        }`,
      )
      // sun through the thin wings: they glow a little
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vPart > 0.5) totalEmissiveRadiance += diffuseColor.rgb * 0.22;');
  };
  return m;
}

const BUTTERFLY_COLORS = [
  [0xf2892c, 0xf9c34d], // monarch orange
  [0x4f8bf0, 0x9fd0ff], // morpho blue
  [0xf6d347, 0xfff3a6], // sulphur yellow
  [0xe66aa1, 0xffb3d1], // pink
  [0x8f6be6, 0xd0b8ff], // lilac
  [0x3fbfb0, 0xa8f0e0], // teal
  [0xf4f0e6, 0xffffff], // cabbage white
  [0xe9553f, 0xffa07a], // red admiral
];

class Butterflies {
  constructor(scene, n, spots, sound) {
    this.n = n;
    this.spots = spots;
    this.sound = sound;
    const geo = butterflyGeometry();
    this.aFlap = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFlap', this.aFlap);
    this.ca = [];
    this.cb = [];
    for (let i = 0; i < 8; i++) {
      const c = BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length];
      this.ca.push(new THREE.Color(c[0]));
      this.cb.push(new THREE.Color(c[1]));
    }
    this.mesh = new THREE.InstancedMesh(geo, butterflyMaterial(this.ca, this.cb), n);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = [];
    for (let i = 0; i < n; i++) this.list.push(this.make(i));
    this.calm = REDUCED_MOTION.matches;
  }

  make(i) {
    const b = {
      i,
      pos: new THREE.Vector3(),
      yaw: rand(-3, 3),
      pitch: 0.5,
      roll: 0,
      size: rand(0.95, 1.2),
      state: 'flit',
      target: null,
      timer: 0,
      phase: Math.random() * TAU,
      flapPhase: Math.random(),
      flap: 0.6,
      glide: 0,
      cool: 0,
      restT: 0,
    };
    const s = this.pickFlower(null, null, []);
    if (s) {
      b.pos.set(s[0] + rand(-0.3, 0.3), s[1] + rand(0.08, 0.3), s[2] + rand(-0.3, 0.3));
      b.target = s;
    }
    return b;
  }

  // a flower to go to next: not far, preferably in view, clear of threats
  pickFlower(from, camera, threats, notThis = null) {
    const S = this.spots;
    if (!S.length) return null;
    let best = null;
    let bestScore = -Infinity;
    for (let k = 0; k < 24; k++) {
      const s = S[(Math.random() * S.length) | 0];
      if (s === notThis) continue;
      let score = Math.random() * 0.6;
      if (from) {
        const d = Math.hypot(s[0] - from.x, s[2] - from.z);
        score -= Math.abs(d - 1.4) * 0.5;
      }
      if (camera) {
        _v.set(s[0], s[1], s[2]).project(camera);
        if (_v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.95) score += 1.2;
      }
      let bad = false;
      for (const t of threats) if (Math.hypot(s[0] - t.x, s[2] - t.z) < t.r + 0.2) bad = true;
      if (bad) score -= 3;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  update(dt, t, camera, threats) {
    for (const b of this.list) this.step(b, dt, t, camera, threats);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aFlap.needsUpdate = true;
  }

  step(b, dt, t, camera, threats) {
    b.cool = Math.max(0, b.cool - dt);
    // scared by a friend or a finger close by: flutter away
    if (b.state === 'perch' || b.cool <= 0) {
      for (const th of threats) {
        if (Math.hypot(b.pos.x - th.x, b.pos.z - th.z) < th.r * 0.8 + 0.12 && b.pos.y < 0.6) {
          this.leave(b, camera, threats, th);
          break;
        }
      }
    }
    const slow = this.calm ? 0.6 : 1;
    if (b.state === 'flit') this.flit(b, dt, t, slow);
    else if (b.state === 'perch') this.perch(b, dt, t, camera, threats);
    this.write(b);
  }

  leave(b, camera, threats, from) {
    const s = this.pickFlower(b.pos, camera, threats, b.target);
    if (!s) return;
    // away from what scared it
    if (from && Math.hypot(s[0] - from.x, s[2] - from.z) < Math.hypot(b.pos.x - from.x, b.pos.z - from.z)) {
      const s2 = this.pickFlower(b.pos, camera, threats, b.target);
      if (s2) return this.go(b, s2);
    }
    this.go(b, s);
  }

  go(b, s) {
    b.target = s;
    b.state = 'flit';
    b.cool = 1.2;
    b.pos.y = Math.max(b.pos.y, s[1] * 0.5 + 0.05);
  }

  flit(b, dt, t, slow) {
    const s = b.target;
    if (!s) return;
    const dx = s[0] - b.pos.x;
    const dz = s[2] - b.pos.z;
    const dist = Math.hypot(dx, dz);
    const dy = s[1] + 0.012 - b.pos.y;
    // a wandering heading: the butterfly weaves towards its flower
    const near = smooth(0.0, 0.6, dist);
    const wobble = (Math.sin(t * 1.9 + b.phase) * 0.9 + Math.sin(t * 4.3 + b.phase * 2) * 0.5) * near;
    const want = Math.atan2(dx, dz) + wobble;
    const turn = angleDiff(b.yaw, want);
    b.yaw += turn * (1 - Math.exp(-4.5 * dt));
    b.roll = damp(b.roll, clamp(-turn * 0.5, -0.5, 0.5), 6, dt);
    let v = 0.4 * slow * (0.75 + 0.25 * Math.sin(t * 3.1 + b.phase));
    v *= clamp(dist / 0.25, 0.3, 1);
    b.pos.x += Math.sin(b.yaw) * v * dt;
    b.pos.z += Math.cos(b.yaw) * v * dt;
    // height: rises and falls in bounds with each wing beat, settling towards the bloom
    const hover = dist > 0.35 ? 0.16 + 0.07 * Math.sin(t * 0.9 + b.phase) : dist * 0.3;
    const wantY = s[1] + 0.012 + hover;
    b.pos.y += (wantY - b.pos.y) * (1 - Math.exp(-2.4 * dt));
    b.bob = Math.cos(b.flapPhase * TAU) * 0.008;
    // wings: a beat about 8 times a second, with a glide now and then
    b.glide -= dt;
    if (b.glide <= 0 && Math.random() < dt * 0.35) b.glide = rand(0.25, 0.5);
    if (b.glide <= 0) b.flapPhase = (b.flapPhase + dt * 8.5 * slow) % 1;
    const f = b.glide > 0 ? 0.75 : 0.42 + 0.72 * Math.sin(b.flapPhase * TAU) - 0.1;
    b.flap = damp(b.flap, f, 40, dt);
    b.pitch = damp(b.pitch, 0.5 + dy * 0.6, 4, dt);
    if (dist < 0.04 && Math.abs(dy) < 0.06) this.alight(b);
  }

  alight(b) {
    b.state = 'perch';
    b.timer = rand(3, 8);
    b.restT = rand(0, 2);
    b.pos.set(b.target[0], b.target[1] + 0.012, b.target[2]);
    b.yaw = rand(-3, 3);
    b.roll = 0;
  }

  perch(b, dt, t, camera, threats) {
    b.timer -= dt;
    b.restT += dt;
    // wings shut, then now and then slowly open and close as if breathing
    const c = b.restT % 5.2;
    const open = c < 1.2 ? 0 : c < 2.1 ? smooth(1.2, 2.1, c) : c < 2.8 ? 1 : 1 - smooth(2.8, 3.6, c);
    const target = 1.32 - open * 1.1 + Math.sin(t * 1.3 + b.phase) * 0.03;
    b.flap = damp(b.flap, target, 5, dt);
    b.pitch = damp(b.pitch, 1.0, 5, dt);
    b.roll = damp(b.roll, 0, 5, dt);
    b.bob = 0;
    if (b.timer <= 0) {
      const s = this.pickFlower(b.pos, camera, threats, b.target);
      if (s) this.go(b, s);
      else b.timer = 2;
    }
  }

  write(b) {
    _e.set(-b.pitch, b.yaw, b.roll, 'YXZ');
    _q.setFromEuler(_e);
    _s.setScalar(b.size);
    this.mesh.setMatrixAt(b.i, _m.compose(_p.set(b.pos.x, b.pos.y + (b.bob || 0), b.pos.z), _q, _s));
    this.aFlap.setX(b.i, b.flap);
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ------------------------------------------------------------ dragonflies

function dragonflyGeometry() {
  const a = acc();
  const dark = () => [0.03, 0.05, 0.06];
  const eye = () => [0.05, 0.42, 0.52];
  ellipsoid(a, [0, 0, 0.027], [0.0072, 0.0068, 0.0072], 0, dark);
  for (const s of [-1, 1]) ellipsoid(a, [s * 0.0062, 0.0025, 0.0305], [0.0058, 0.0058, 0.0058], 0, eye, 10, 8);
  // thorax with a pale stripe on each side
  ellipsoid(a, [0, 0.001, 0.008], [0.0088, 0.0088, 0.0145], 0, (x, y, z) => (Math.abs(x) > 0.005 && Math.sin(z * 260) > 0.2 ? [0.55, 0.85, 0.75] : [0.05, 0.3, 0.32]), 14, 10);
  // the long banded abdomen, drooping a little
  const g = new THREE.CylinderGeometry(0.0034, 0.0021, 0.09, 8, 12, false);
  g.rotateX(Math.PI / 2); // along z, tip towards -z after the flip below
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    // cylinder axis now runs z from +0.045 to -0.045; move so the base is at -0.004
    const z = p.getZ(i);
    p.setZ(i, -0.004 - (0.045 - z));
    const k = (0.045 - z) / 0.09;
    p.setY(i, p.getY(i) - k * k * 0.014);
  }
  push(a, g, 0, (x, y, z) => {
    const k = clamp((-0.004 - z) / 0.09, 0, 1);
    const band = Math.floor(k * 11);
    return band % 2 === 0 ? [0.06, 0.36, 0.85] : [0.03, 0.08, 0.2];
  });
  ellipsoid(a, [0, -0.0135, -0.097], [0.0026, 0.0026, 0.005], 0, dark, 6, 4);
  // wings: long, thin, in two pairs
  const wings = acc();
  for (const [kind, z0, len, chord] of [[1, 0.016, 0.062, 0.0125], [2, 0.002, 0.058, 0.0165]]) {
    for (const mirror of [false, true]) {
      const N = 10;
      const pos = [];
      const uv = [];
      const idx = [];
      for (let i = 0; i <= N; i++)
        for (let j = 0; j <= 2; j++) {
          const u = i / N;
          const v = j / 2;
          const w = chord * Math.pow(Math.max(0, 1 - Math.pow(u, 3)), 0.5) + 0.002;
          const x = 0.005 + len * u;
          const z = z0 + (0.5 - v) * w * 2 * 0.5 - u * 0.006;
          pos.push(mirror ? -x : x, 0.006 + 0.003 * Math.sin(v * Math.PI) * (1 - u), z);
          uv.push(u, v);
        }
      for (let i = 0; i < N; i++)
        for (let j = 0; j < 2; j++) {
          const a0 = i * 3 + j, a1 = a0 + 1, a2 = a0 + 3, a3 = a2 + 1;
          idx.push(a0, a2, a1, a1, a2, a3);
        }
      const base = wings.pos.length / 3;
      for (let i = 0; i < pos.length / 3; i++) {
        wings.pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        wings.nor.push(0, 1, 0);
        wings.uv.push(uv[i * 2], uv[i * 2 + 1]);
        wings.part.push(kind);
        wings.col.push(0, 0, 0);
      }
      for (const k of idx) wings.idx.push(base + k);
    }
  }
  return [finish(a), finish(wings)];
}

const DRAGON_DECL = /* glsl */ `
attribute vec2 aUv;
attribute float aPart;
attribute vec3 aCol;
attribute vec2 aWing;
varying vec2 vUvW;
varying float vPart;
varying vec3 vFix;
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
`;

const DRAGON_POSE = /* glsl */ `
vec3 bp = position;
vec3 bn = objectNormal;
if (aPart > 0.5) {
  float side = position.x > 0.0 ? 1.0 : -1.0;
  float ang = aPart > 1.5 ? aWing.y : aWing.x;
  vec3 pv = vec3(side * 0.005, 0.006, aPart > 1.5 ? 0.002 : 0.016);
  mat3 R = rotZ(side * ang) * rotY(side * ang * 0.35);
  bp = pv + R * (position - pv);
  bn = R * bn;
}
`;

class Dragonflies {
  constructor(scene, n, pond, sound) {
    this.n = n;
    this.pond = pond;
    this.sound = sound;
    const [bodyGeo, wingGeo] = dragonflyGeometry();
    this.aWing = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage);
    bodyGeo.setAttribute('aWing', this.aWing);
    wingGeo.setAttribute('aWing', this.aWing);
    const bm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.35 });
    bm.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', `#include <common>\n${DRAGON_DECL}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${DRAGON_POSE}\nobjectNormal = normalize(bn);`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = bp;\nvFix = aCol;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFix;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vFix;');
    };
    const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    wm.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', `#include <common>\n${DRAGON_DECL}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${DRAGON_POSE}\nobjectNormal = normalize(bn);`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = bp;\nvUvW = aUv;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vUvW;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // a faint iridescent sheen, veins, and a dark spot near the tip
          float veins = 0.75 + 0.25 * abs(sin(vUvW.y * 25.0)) * abs(sin(vUvW.x * 14.0 + vUvW.y * 3.0));
          diffuseColor.rgb = mix(vec3(0.85, 0.95, 1.0), vec3(0.75, 0.9, 1.0), vUvW.x) * veins;
          float sp = smoothstep(0.08, 0.02, length(vec2((vUvW.x - 0.8) * 3.0, vUvW.y - 0.25)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.07, 0.05), sp);
          diffuseColor.a *= mix(0.55, 0.9, sp);`,
        );
    };
    this.body = new THREE.InstancedMesh(bodyGeo, bm, n);
    this.wings = new THREE.InstancedMesh(wingGeo, wm, n);
    this.wings.renderOrder = 4;
    for (const m of [this.body, this.wings]) {
      m.frustumCulled = false;
      scene.add(m);
    }
    this.list = [];
    for (let i = 0; i < n; i++) this.list.push(this.make(i));
    this.calm = REDUCED_MOTION.matches;
  }

  anchor(out, low = false) {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * (low ? 0.8 : 1.0) + 0.05;
    return out.set(POND.x + Math.cos(a) * r, low ? WATER_Y + 0.035 : rand(0.16, 0.5), POND.z + Math.sin(a) * r);
  }

  make(i) {
    const d = {
      i,
      pos: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      yaw: rand(-3, 3),
      pitch: 0.1,
      roll: 0,
      state: 'hover',
      timer: rand(1, 3),
      u: 0,
      dur: 0.5,
      phase: Math.random() * TAU,
      flapPhase: Math.random(),
      size: rand(0.92, 1.1),
      dips: 0,
    };
    this.anchor(d.pos);
    d.to.copy(d.pos);
    return d;
  }

  update(dt, t, threats) {
    for (const d of this.list) this.step(d, dt, t, threats);
    this.body.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
    this.aWing.needsUpdate = true;
  }

  dart(d, to, dur, state = 'dart') {
    d.from.copy(d.pos);
    d.to.copy(to);
    d.u = 0;
    d.dur = dur;
    d.state = state;
  }

  step(d, dt, t, threats) {
    const slow = this.calm ? 0.6 : 1;
    // scared away from the pond's edge by a friend or a finger
    if (d.state === 'hover') {
      for (const th of threats) {
        if (Math.hypot(d.pos.x - th.x, d.pos.z - th.z) < th.r * 0.7 + 0.18 && d.pos.y < 0.7) {
          this.anchor(_p);
          this.dart(d, _p, 0.4 / slow);
          break;
        }
      }
    }
    if (d.state === 'hover') {
      d.timer -= dt;
      // it hangs in the air, jittering a little
      d.pos.x += Math.sin(t * 7.3 + d.phase) * 0.012 * dt * 9;
      d.pos.z += Math.cos(t * 6.1 + d.phase * 2) * 0.012 * dt * 9;
      d.pos.y += Math.sin(t * 9 + d.phase) * 0.004 * dt * 9;
      d.pitch = damp(d.pitch, 0.18, 6, dt);
      d.roll = damp(d.roll, 0, 6, dt);
      d.yaw += Math.sin(t * 0.8 + d.phase) * 0.15 * dt;
      if (d.timer <= 0) {
        d.dips++;
        if (d.dips % 3 === 0) {
          this.anchor(_p, true);
          this.dart(d, _p, rand(0.5, 0.7) / slow, 'dip');
        } else {
          this.anchor(_p);
          this.dart(d, _p, rand(0.35, 0.7) / slow);
        }
        d.timer = rand(1.4, 3.6) / slow;
      }
    } else {
      d.u = Math.min(1, d.u + dt / d.dur);
      const k = d.u * d.u * (3 - 2 * d.u);
      d.pos.lerpVectors(d.from, d.to, k);
      const dx = d.to.x - d.from.x;
      const dz = d.to.z - d.from.z;
      if (Math.hypot(dx, dz) > 0.05) {
        const want = Math.atan2(dx, dz);
        const diff = angleDiff(d.yaw, want);
        d.yaw += diff * (1 - Math.exp(-14 * dt));
        d.roll = damp(d.roll, clamp(-diff * 0.4, -0.5, 0.5), 8, dt);
      }
      d.pitch = damp(d.pitch, d.state === 'dip' && d.u > 0.5 ? 0.5 : -0.1, 8, dt);
      if (d.u >= 1) {
        if (d.state === 'dip') {
          // the tip of the tail touches the water: a ripple, a drop of sound, and up again
          this.pond?.ripple(d.pos.x - Math.sin(d.yaw) * 0.09, d.pos.z - Math.cos(d.yaw) * 0.09, 0.55);
          this.sound?.()?.plip(d.pos.x, WATER_Y, d.pos.z, 0.4);
          this.anchor(_p);
          _p.y = rand(0.2, 0.4);
          this.dart(d, _p, 0.45 / slow, 'dart');
        } else {
          d.state = 'hover';
        }
      }
    }
    // wings: the front pair and back pair beat against each other
    d.flapPhase = (d.flapPhase + dt * 13 * slow) % 1;
    const a = Math.sin(d.flapPhase * TAU);
    this.aWing.setXY(d.i, 0.06 + a * 0.5, 0.06 - a * 0.5);
    _e.set(-d.pitch, d.yaw, d.roll, 'YXZ');
    _q.setFromEuler(_e);
    _s.setScalar(d.size);
    _m.compose(_p.set(d.pos.x, d.pos.y, d.pos.z), _q, _s);
    this.body.setMatrixAt(d.i, _m);
    this.wings.setMatrixAt(d.i, _m);
  }

  dispose(scene) {
    scene.remove(this.body, this.wings);
    for (const m of [this.body, this.wings]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}

// ------------------------------------------------------------ both

export class Insects {
  // world: the World (flowers.userData.spots); pond: PondLife (ripples); sound(): the Ambient or null
  constructor({ scene, quality, world, pond, sound }) {
    this.scene = scene;
    const low = quality.tier === 'low';
    const mid = quality.tier === 'medium';
    const spots = world.flowers?.userData.spots || [];
    this.butterflies = new Butterflies(scene, low ? 3 : mid ? 5 : 7, spots, sound);
    this.dragonflies = new Dragonflies(scene, low ? 1 : mid ? 2 : 3, pond, sound);
    this.threats = [];
  }

  update(dt, t, { camera, friends, pointer }) {
    const th = this.threats;
    th.length = 0;
    for (const f of friends) th.push({ x: f.pos.x, z: f.pos.z, r: (f.radius || 0.15) + 0.2 + Math.min(f.speed || 0, 0.8) * 0.5 });
    if (pointer) th.push({ x: pointer.x, z: pointer.z, r: 0.35 });
    this.butterflies.update(dt, t, camera, th);
    this.dragonflies.update(dt, t, th);
  }

  dispose() {
    this.butterflies.dispose(this.scene);
    this.dragonflies.dispose(this.scene);
  }
}
