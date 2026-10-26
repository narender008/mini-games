// Magic in the air: tiny glowing motes of pollen and fairy dust drifting in
// the late sun all over the studio and garden, and a few glossy drops of
// paint that float by the easel, bobbing and turning slowly, as if the
// paint itself were waiting to come alive.
import * as THREE from 'three';
import { rng, TAU } from '../config.js';

const MOTE_VERT = /* glsl */ `
attribute vec4 aSeed; // phase, speed, size, hue
uniform float uTime;
uniform float uScale;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 p = position;
  float t = uTime * aSeed.y + aSeed.x * 6.2831;
  // slow drifting loops, rising a little
  p += vec3(sin(t * 0.7) * 0.25 + sin(t * 1.9) * 0.05, sin(t * 0.5) * 0.18 + fract(uTime * 0.012 * aSeed.y + aSeed.x) * 0.6, cos(t * 0.6) * 0.25);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed.y * 2.0) + aSeed.x * 40.0);
  vA = tw;
  vCol = mix(vec3(2.4, 1.6, 0.7), vec3(1.6, 1.4, 2.2), aSeed.w);
  // (never more than a few pixels: close to the camera they would be big discs)
  gl_PointSize = min(aSeed.z * uScale / -mv.z, uScale * 0.009);
  gl_Position = projectionMatrix * mv;
}`;

const MOTE_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  float a = exp(-r * 5.0) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol * a, a);
}`;

export class Motes {
  constructor(scene, count = 220) {
    const R = rng(311);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // most over the garden, some in the studio round the easel
      const near = R() < 0.35;
      const x = near ? (R() - 0.5) * 3 : (R() - 0.5) * 12;
      const z = near ? -0.6 + R() * 2.4 : -1 - R() * 8;
      pos.set([x, 0.2 + R() * (near ? 1.8 : 2.6), z], i * 3);
      seed.set([R(), 0.3 + R() * 0.7, 0.012 + R() * 0.02, R() < 0.8 ? 0 : 1], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.uniforms = { uTime: { value: 0 }, uScale: { value: 600 } };
    const m = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  setViewport(heightPx) {
    this.uniforms.uScale.value = heightPx * 0.9;
  }

  update(t) {
    this.uniforms.uTime.value = t;
  }
}

// glossy floating paint drops by the easel
export class PaintDrops {
  constructor(scene, colors, count = 9) {
    const R = rng(97);
    const geo = new THREE.SphereGeometry(1, 24, 16);
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.castShadow = false;
    this.drops = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // round the canvas but not in front of it
      const side = i % 2 ? 1 : -1;
      const d = {
        base: new THREE.Vector3(side * (0.45 + R() * 0.55), 0.75 + R() * 0.8, -0.3 + R() * 0.7),
        r: 0.011 + R() * 0.014,
        ph: R() * TAU,
        sp: 0.4 + R() * 0.5,
        stretch: 1.2 + R() * 0.5,
      };
      this.drops.push(d);
      this.mesh.setColorAt(i, c.set(colors[i % colors.length]));
    }
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
    scene.add(this.mesh);
    this.update(0);
  }

  update(t) {
    const { m, q, e, p, s } = this;
    this.drops.forEach((d, i) => {
      const k = t * d.sp + d.ph;
      p.copy(d.base);
      p.x += Math.sin(k * 0.7) * 0.06;
      p.y += Math.sin(k) * 0.05;
      p.z += Math.cos(k * 0.8) * 0.04;
      // a drop wobbles like liquid and leans into its motion
      const w = Math.sin(k * 3.1) * 0.08;
      e.set(Math.cos(k) * 0.5, k * 0.3, Math.sin(k * 0.7) * 0.5);
      q.setFromEuler(e);
      s.set(d.r * (1 + w), d.r * d.stretch * (1 - w), d.r * (1 + w));
      m.compose(p, q, s);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Strings of warm little bulbs hung in sagging arcs between points (tree to
// tree, post to post): with the depth of field they turn into soft bokeh.
export function stringLights(spans, { bulbs = 14, sag = 0.35, size = 0.018, color = new THREE.Color(5, 3.2, 1.4) } = {}) {
  const group = new THREE.Group();
  const pts = [];
  const wire = [];
  for (const [a, b] of spans) {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const n = Math.max(4, Math.round(A.distanceTo(B) / 0.35) + bulbs * 0);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const p = A.clone().lerp(B, t);
      p.y -= Math.sin(t * Math.PI) * sag * A.distanceTo(B) * 0.25;
      wire.push(p);
    }
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = A.clone().lerp(B, t);
      p.y -= Math.sin(t * Math.PI) * sag * A.distanceTo(B) * 0.25 + 0.02;
      pts.push(p);
    }
  }
  const mat = new THREE.MeshBasicMaterial({ color });
  const bulbsMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 8, 6), mat, pts.length);
  const m = new THREE.Matrix4();
  pts.forEach((p, i) => bulbsMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  group.add(bulbsMesh);
  // the wires, thin and dark
  const segs = [];
  for (let i = 0; i < wire.length - 1; i++) if ((i + 1) % 25 !== 0) segs.push(wire[i], wire[i + 1]);
  const lg = new THREE.BufferGeometry().setFromPoints(segs);
  group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2018 })));
  group.userData.mat = mat;
  return group;
}
