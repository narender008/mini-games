// The balcony: a black steel balustrade with an iroko handrail along the
// open edges, a string of festoon lights draped under the rail that glow at
// night, the building's brick side wall with a white sash window, and the
// slab edge under the deck. The town below lives in city.js.
import * as THREE from 'three';
import { grainUV, merge, plankGeo, PAINT } from './geom.js';
export { cityBelow } from './city.js';

const up = () => new THREE.Vector3(0, 1, 0);

function bar(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  return g;
}

// One straight run of balustrade from a to b (Vector3 on the deck), with
// posts at both ends and every ~1.2 m. Returns metal and handrail parts.
function balustrade(a, b, height, rnd, metal, rail, perches, { startPost = true } = {}) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const ang = Math.atan2(-dir.z, dir.x);
  const run = [];
  const bays = Math.max(1, Math.round(len / 1.2));
  const hr = 0.045; // handrail height
  const topBar = height - hr - 0.006;
  // posts (40 mm square) with base plates
  for (let i = startPost ? 0 : 1; i <= bays; i++) {
    const s = (i / bays) * len;
    const inset = i === 0 ? 0.02 : i === bays ? -0.02 : 0;
    run.push(bar(0.04, topBar, 0.04, s + inset, topBar / 2, 0));
    run.push(bar(0.1, 0.008, 0.1, s + inset, 0.004, 0));
  }
  // bottom rail, top flat bar, balusters
  run.push(bar(len, 0.02, 0.04, len / 2, 0.1, 0));
  run.push(bar(len, 0.012, 0.05, len / 2, topBar - 0.006, 0));
  const pitch = 0.11;
  const n = Math.floor(len / pitch);
  for (let k = 1; k < n; k++) {
    const s = (k / n) * len;
    if (Math.abs(((s / len) * bays) % 1) < 0.03 || Math.abs(((s / len) * bays) % 1) > 0.97) continue;
    run.push(bar(0.014, topBar - 0.11 - 0.012, 0.014, s, 0.11 + (topBar - 0.122) / 2, 0));
  }
  const m = merge(run);
  m.rotateY(ang);
  m.translate(a.x, a.y, a.z);
  metal.push(m);
  // the hardwood handrail: 70 x 45 mm with well-rounded arrises
  const h = grainUV(plankGeo(len + 0.03, hr, 0.07, { r: 0.014, b: 0.004 }), 'x', rnd);
  h.translate(len / 2, height - hr / 2, 0);
  h.rotateY(ang);
  h.translate(a.x, a.y, a.z);
  rail.push(h);
  for (let s = 0.3; s < len - 0.1; s += 0.55 + rnd() * 0.2) perches.push({ pos: a.clone().addScaledVector(dir, s).setY(height), normal: up() });
}

// Festoon lights: warm globe bulbs on a black cable, draped in shallow
// swags between the posts just under the handrail. Faintly visible by day,
// glowing at night (bloom does the rest).
function festoon(a, b, height, rnd) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const swags = Math.max(1, Math.round(len / 1.2));
  const pts = [];
  const cable = [];
  for (let i = 0; i < swags; i++) {
    const p0 = a.clone().addScaledVector(dir, (i / swags) * len);
    const p1 = a.clone().addScaledVector(dir, ((i + 1) / swags) * len);
    const steps = 24;
    const path = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const p = p0.clone().lerp(p1, t);
      p.y = height - 0.07 - 0.11 * (1 - (2 * t - 1) ** 2);
      p.z += 0.03;
      path.push(p);
    }
    cable.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 32, 0.0022, 4, false).toNonIndexed());
    for (let k = 1; k < 8; k++) pts.push(path[Math.round((k / 8) * steps)].clone());
  }
  const bulbs = [];
  const sockets = [];
  for (const p of pts) {
    const s = new THREE.CylinderGeometry(0.006, 0.007, 0.022, 8).toNonIndexed();
    s.translate(p.x, p.y - 0.012, p.z);
    sockets.push(s);
    const g = new THREE.SphereGeometry(0.0125, 12, 8);
    g.translate(p.x, p.y - 0.034, p.z);
    bulbs.push(g);
  }
  return { cable, sockets, bulbs: merge(bulbs), points: pts.map((p) => p.clone().setY(p.y - 0.034)) };
}

// A soft additive halo round each bulb at night, always facing the camera.
function halos(points) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  const off = new Float32Array(points.length * 3);
  points.forEach((p, i) => off.set([p.x, p.y, p.z], i * 3));
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  geo.instanceCount = points.length;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uLevel: { value: 0 } },
    vertexShader: /* glsl */ `
attribute vec3 aOffset;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
  mv.xy += position.xy * 0.16;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uLevel;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float g = exp(-r * r * 9.0) * 0.8 + exp(-r * r * 60.0) * 0.6;
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * g * uLevel, 1.0);
}`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 2;
  return m;
}

export function railing(r, rnd, quality) {
  const metal = [];
  const rail = [];
  const perches = [];
  const h = r.height || 1;
  const a = new THREE.Vector3(r.x0, 0, r.z);
  const b = new THREE.Vector3(r.x1, 0, r.z);
  balustrade(a, b, h, rnd, metal, rail, perches);
  // the open right-hand side returns towards the camera
  const c = new THREE.Vector3(r.x1, 0, 2.3);
  balustrade(b.clone().setX(r.x1 - 0.02), c.clone().setX(r.x1 - 0.02), h, rnd, metal, rail, perches, { startPost: false });
  // the concrete slab edge under the deck
  const slab = bar(r.x1 - r.x0 + 0.04, 0.24, 0.12, (r.x0 + r.x1) / 2, -0.12, r.z - 0.02);
  const f = festoon(a.clone().setX(r.x0 + 0.02), b.clone().setX(r.x1 - 0.02), h, rnd);
  metal.push(...f.cable, ...f.sockets);

  const group = new THREE.Group();
  const bulbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f3eee4'), roughness: 0.3, emissive: new THREE.Color('#ffb060'), emissiveIntensity: 0 });
  const bulbs = new THREE.Mesh(f.bulbs, bulbMat);
  bulbs.castShadow = false;
  group.add(bulbs);
  const glow = halos(f.points);
  glow.visible = false;
  group.add(glow);
  const twinkle = f.points.map(() => rnd() * 6.28);
  void twinkle;
  let level = -1;
  return {
    metal: merge(metal),
    rail: merge(rail),
    slab,
    perches,
    lights: {
      object: group,
      update(dt, t, night) {
        // lights come on as dusk falls; a gentle breathing, never flicker
        const k = Math.min(1, Math.max(0, (night - 0.25) / 0.5));
        const v = k * (0.92 + 0.08 * Math.sin(t * 0.8));
        if (Math.abs(v - level) < 0.002) return;
        level = v;
        bulbMat.emissiveIntensity = 0.15 + v * 5;
        glow.visible = v > 0.01;
        glow.material.uniforms.uLevel.value = v * (quality && quality.tier === 'low' ? 0.7 : 1);
      },
    },
  };
}

// The building's side wall on the left: London stock brick with a stone
// coping, a white sash window with a sill, and the wall's return at the
// balcony edge.
export function sideWall(layout, rnd) {
  const x = layout.wall.x;
  const z0 = layout.railing ? layout.railing.z - 0.35 : -1.8;
  const z1 = 4;
  const hgt = 3.2;
  const brick = [];
  const frame = [];
  // the wall face (facing +x), with UVs in metres / 0.9 (one texture tile)
  const face = new THREE.PlaneGeometry(z1 - z0, hgt + 0.4, 1, 1);
  face.rotateY(Math.PI / 2);
  face.translate(x, hgt / 2 - 0.2, (z0 + z1) / 2);
  setUV(face, (p) => [p.z / 0.9, p.y / 0.9]);
  brick.push(face);
  // the return where the wall meets the balcony edge
  const ret = new THREE.PlaneGeometry(0.35, hgt + 0.4);
  ret.translate(x - 0.175, hgt / 2 - 0.2, z0);
  setUV(ret, (p) => [p.x / 0.9 + 0.13, p.y / 0.9]);
  brick.push(ret);
  // sash window, 1.0 m wide by 1.45 m tall, sill at 0.85 m
  const wz = 0.9;
  const wy = 0.85;
  const W = 1.0;
  const H = 1.45;
  const fx = x + 0.02;
  const sill = new THREE.BoxGeometry(0.1, 0.06, W + 0.16).toNonIndexed();
  sill.translate(x + 0.04, wy - 0.03, wz);
  frame.push(sill);
  const f = (w, h, d, px, py, pz) => {
    const g = grainUV(new THREE.BoxGeometry(d, h, w).toNonIndexed(), 'y', rnd, { atlas: PAINT });
    g.translate(px, py, pz);
    frame.push(g);
  };
  f(0.07, H, 0.06, fx, wy + H / 2, wz - W / 2 + 0.035);
  f(0.07, H, 0.06, fx, wy + H / 2, wz + W / 2 - 0.035);
  f(W, 0.07, 0.06, fx, wy + H - 0.035, wz);
  f(W, 0.06, 0.06, fx, wy + 0.03, wz);
  // meeting rail and glazing bars (two over two)
  f(W - 0.1, 0.05, 0.05, fx + 0.01, wy + H / 2, wz);
  f(0.025, H - 0.12, 0.035, fx + 0.012, wy + H / 2, wz);
  const glassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#141a20'), roughness: 0.04, metalness: 0.1, envMapIntensity: 1.4 });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, H - 0.1), glassMat);
  glass.rotation.y = Math.PI / 2;
  glass.position.set(x + 0.005, wy + H / 2, wz);
  glass.receiveShadow = true;
  // stone coping along the wall top
  const cope = new THREE.BoxGeometry(0.4, 0.07, z1 - z0).toNonIndexed();
  cope.translate(x - 0.15, hgt + 0.035, (z0 + z1) / 2);
  frame.push(cope);
  return { brick: merge(brick), frame: merge(frame), meshes: [glass] };
}

function setUV(g, fn) {
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const [a, b] = fn(v);
    uv.setXY(i, a, b);
  }
}
