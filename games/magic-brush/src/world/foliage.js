// Plants for the garden, all instanced: grass blades that sway in the
// breeze, leaf cards for bushes and tree crowns (each card a small spray of
// leaves drawn once on a canvas), and little flowers in clumps.
import * as THREE from 'three';
import { rng } from '../config.js';

// shared breeze uniform for everything that sways
export const WIND = { uWindTime: { value: 0 }, uWindStrength: { value: 1 } };

const WIND_GLSL = /* glsl */ `
uniform float uWindTime;
uniform float uWindStrength;
vec2 windAt(vec3 p) {
  float t = uWindTime;
  float g = sin(p.x * 0.35 + t * 1.1) * 0.5 + sin(p.z * 0.27 - t * 0.8 + 1.3) * 0.5;
  float f = sin(p.x * 2.1 + p.z * 1.7 + t * 3.1) * 0.25;
  return vec2(0.8, 0.35) * (g * 0.7 + f + 0.35) * uWindStrength;
}`;

// project an instanced vertex, swaying it in world space by `amount`
function windProject(amount) {
  return /* glsl */ `
  vec4 mvPosition = vec4(transformed, 1.0);
  mvPosition = instanceMatrix * mvPosition;
  vec3 ipw = instanceMatrix[3].xyz;
  mvPosition.xz += windAt(ipw) * (${amount});
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;`;
}

// ------------------------------------------------------------ grass

function bladeGeometry() {
  // a tapered, gently curved blade, 5 segments tall, 1 m high (scaled per instance)
  const seg = 5;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const w = 0.5 * (1 - t) * (1 - t * 0.2);
    const bend = t * t * 0.25;
    pos.push(-w, t, bend, w, t, bend);
    uv.push(0, t, 1, t);
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A lawn of blades inside `area(x, z) => density 0..1` over a rectangle.
export function grassField({ count, x0, x1, z0, z1, density, height = 0.09, width = 0.006, seed = 1, colors }) {
  const R = rng(seed);
  const geo = bladeGeometry();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, side: THREE.DoubleSide });
  const cols = (colors || [0x6f9a3a, 0x86ac45, 0x5c8a34, 0x9bb850, 0x7aa03c]).map((c) => new THREE.Color(c));
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, WIND);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}\nvarying float vH;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = uv.y;')
      .replace('#include <project_vertex>', windProject('uv.y * uv.y * 0.035 * length(instanceMatrix[1].xyz) / 0.09'));
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.45 + 0.75 * vH;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  let tries = 0;
  while (n < count && tries < count * 8) {
    tries++;
    const x = x0 + R() * (x1 - x0);
    const z = z0 + R() * (z1 - z0);
    if (R() > density(x, z)) continue;
    e.set((R() - 0.5) * 0.35, R() * Math.PI * 2, (R() - 0.5) * 0.35);
    q.setFromEuler(e);
    const h = height * (0.55 + R() * 0.9);
    sc.set(width * (0.7 + R() * 0.6), h, h);
    p.set(x, 0, z);
    m.compose(p, q, sc);
    mesh.setMatrixAt(n, m);
    c.copy(cols[Math.floor(R() * cols.length)]).multiplyScalar(0.85 + R() * 0.3);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------ leaves

// a card with a spray of leaves on it: colour texture (alpha = leaf)
export function leafCardTexture({ size = 256, seed = 2, hue = 0x5d8f35, light = 0x9cc653, kind = 'round' } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const R = rng(seed);
  const a = new THREE.Color(hue);
  const b = new THREE.Color(light);
  const leaves = kind === 'small' ? 22 : 11;
  // twig
  g.strokeStyle = '#5a4128';
  g.lineWidth = size * 0.012;
  g.beginPath();
  g.moveTo(size * 0.5, size);
  g.quadraticCurveTo(size * 0.45, size * 0.5, size * 0.52, size * 0.12);
  g.stroke();
  for (let i = 0; i < leaves; i++) {
    const t = 0.15 + R() * 0.8;
    const x = size * (0.5 + (R() - 0.5) * 0.55 * (1 - t * 0.3));
    const y = size * (1 - t);
    const len = size * (kind === 'small' ? 0.1 + R() * 0.07 : 0.17 + R() * 0.1);
    const wid = len * (kind === 'small' ? 0.5 : 0.45);
    const ang = (R() - 0.5) * 2.2 - Math.PI / 2;
    const k = R();
    const col = a.clone().lerp(b, k * 0.8);
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const grd = g.createLinearGradient(0, -wid, 0, wid);
    grd.addColorStop(0, `#${col.clone().multiplyScalar(0.8).getHexString()}`);
    grd.addColorStop(0.5, `#${col.getHexString()}`);
    grd.addColorStop(1, `#${col.clone().multiplyScalar(0.7).getHexString()}`);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.45, -wid, len, 0);
    g.quadraticCurveTo(len * 0.45, wid, 0, 0);
    g.fill();
    g.strokeStyle = `rgba(255,255,220,0.25)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.9, 0);
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A crown of leaf cards filling ellipsoids (lists of [x, y, z, rx, ry, rz]).
export function foliage({ blobs, count, texture, seed = 3, size = 0.35, tint = 0xffffff, sway = 1 }) {
  const R = rng(seed);
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.7,
    color: tint,
  });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, WIND);
    s.uniforms.uSway = { value: sway };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}\nuniform float uSway;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        vec2 w = windAt(ip) * 0.06 * uSway * position.y;
        float fl = sin(uWindTime * 4.0 + ip.x * 7.0 + ip.z * 5.0) * 0.08 * uSway * position.y;
        transformed.x += w.x + fl;
        transformed.z += w.y;`,
      )
      // leaves face outward from the crown: a bent normal lights them like a canopy
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        objectNormal = normalize(objectNormal + vec3(0.0, 0.6, 0.0));`,
      );
    // light through leaves from behind
    s.fragmentShader = s.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        vec3 L = directionalLights[0].direction;
        float th = pow(saturate(dot(normalize(vViewPosition), -L)), 3.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * th * 0.6;
      }
      #endif`,
    );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  const vol = blobs.map((b) => b[3] * b[4] * b[5]);
  const tot = vol.reduce((a, b) => a + b, 0);
  for (let i = 0; i < count; i++) {
    let r = R() * tot;
    let k = 0;
    while (r > vol[k] && k < blobs.length - 1) r -= vol[k++];
    const b = blobs[k];
    // mostly near the surface of the blob
    const u = Math.cbrt(0.35 + 0.65 * R());
    const th = R() * Math.PI * 2;
    const ph = Math.acos(2 * R() - 1);
    const dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th);
    p.set(b[0] + dx * b[3] * u, b[1] + dy * b[4] * u, b[2] + dz * b[5] * u);
    e.set((R() - 0.5) * 1.6, R() * Math.PI * 2, (R() - 0.5) * 1.6);
    q.setFromEuler(e);
    const s = size * (0.75 + R() * 0.5);
    sc.set(s, s, s);
    m.compose(p, q, sc);
    mesh.setMatrixAt(i, m);
    // darker inside and underneath (the crown shades itself)
    const shade = 0.55 + 0.45 * Math.min(1, u * (0.7 + 0.3 * (dy * 0.5 + 0.5)));
    c.setScalar(shade * (0.9 + R() * 0.2));
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------ flowers

function flowerGeometry(petals = 6) {
  // a cupped ring of rounded petals around a little centre, 1 unit across
  const pos = [];
  const col = [];
  const idx = [];
  const add = (x, y, z, c) => {
    pos.push(x, y, z);
    col.push(c, c, c);
    return pos.length / 3 - 1;
  };
  const centre = add(0, 0.06, 0, 0);
  for (let p = 0; p < petals; p++) {
    const a0 = (p / petals) * Math.PI * 2;
    const steps = 5;
    const ring = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = a0 + (t - 0.5) * ((Math.PI * 2) / petals) * 0.95;
      const r = 0.5 * Math.sin(t * Math.PI) ** 0.6;
      ring.push(add(Math.cos(a) * r, 0.12 * r * r * 4, Math.sin(a) * r, 1));
    }
    const base = add(Math.cos(a0) * 0.05, 0.02, Math.sin(a0) * 0.05, 1);
    for (let i = 0; i < steps; i++) idx.push(base, ring[i + 1], ring[i]);
  }
  // the centre button
  const n = 8;
  const cs = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    cs.push(add(Math.cos(a) * 0.1, 0.05, Math.sin(a) * 0.1, 0));
  }
  for (let i = 0; i < n; i++) idx.push(centre, cs[(i + 1) % n], cs[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPetal', new THREE.Float32BufferAttribute(col.filter((_, i) => i % 3 === 0), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// clumps of little flowers: positions [[x, z, radius, count, colours[]], ...]
export function flowerBeds({ beds, seed = 5, headSize = 0.045, stem = 0.22 }) {
  const R = rng(seed);
  let total = 0;
  for (const b of beds) total += b[3];
  const headGeo = flowerGeometry(6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide });
  headMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, WIND);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}\nattribute float aPetal;\nvarying float vPetal;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPetal = aPetal;
        vec3 ip = instanceMatrix[3].xyz;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition.xz += windAt(ip) * 0.03 * ip.y / 0.25;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPetal;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(0.95, 0.72, 0.18), diffuseColor.rgb, vPetal);');
  };
  const heads = new THREE.InstancedMesh(headGeo, headMat, total);
  const stemGeo = new THREE.CylinderGeometry(0.004, 0.006, 1, 4, 1).translate(0, 0.5, 0);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4f7a2c, roughness: 0.7 });
  stemMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, WIND);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}`)
      .replace('#include <project_vertex>', windProject('0.03 * position.y * position.y'));
  };
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, total);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  for (const [bx, bz, br, cnt, colors] of beds) {
    for (let i = 0; i < cnt; i++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * br;
      const x = bx + Math.cos(a) * r;
      const z = bz + Math.sin(a) * r;
      const h = stem * (0.6 + R() * 0.8) * (1 - (r / br) * 0.35);
      p.set(x, 0, z);
      sc.set(1, h, 1);
      q.identity();
      m.compose(p, q, sc);
      stems.setMatrixAt(n, m);
      e.set((R() - 0.5) * 0.6, R() * 6.28, (R() - 0.5) * 0.6);
      q.setFromEuler(e);
      const s = headSize * (0.7 + R() * 0.6);
      sc.set(s, s, s);
      p.set(x, h, z);
      m.compose(p, q, sc);
      heads.setMatrixAt(n, m);
      c.set(colors[Math.floor(R() * colors.length)]).multiplyScalar(0.85 + R() * 0.25);
      heads.setColorAt(n, c);
      n++;
    }
  }
  heads.castShadow = false;
  heads.receiveShadow = true;
  stems.receiveShadow = true;
  heads.frustumCulled = stems.frustumCulled = false;
  const g = new THREE.Group();
  g.add(stems, heads);
  return g;
}
