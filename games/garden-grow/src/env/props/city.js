// The town far below the balcony: terraced streets of brick and rendered
// houses under slate and clay-tile roofs, chimney stacks, street trees and
// back gardens, hazy hills beyond. One instanced mesh draws every house
// (walls, gables and roof, with windows painted in its shader); at night
// some windows and the street lamps glow warm. Fog and depth of field soften
// it all, so it stays cheap.
import * as THREE from 'three';
import { noise2 } from '../../shared.js';
import { Cards, treeLine } from './backdrop.js';

const STREET = -13; // street level, metres below the balcony floor (a fourth floor)

// A unit house: walls x -0.5..0.5 (along the street), z -0.5..0.5 (depth),
// y 0..1 to the eaves, gables at both ends, a pitched roof with a small
// overhang rising to a ridge at y = 1.5. aPart: 0 wall, 1 roof.
function houseGeo() {
  const pos = [];
  const part = [];
  const quad = (a, b, c, d, p) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) part.push(p);
  };
  const tri = (a, b, c, p) => {
    pos.push(...a, ...b, ...c);
    part.push(p, p, p);
  };
  const R = 1.5;
  // walls (counter-clockwise seen from outside)
  quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5], 0);
  quad([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5], 0);
  quad([0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5], 0);
  quad([-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5], 0);
  // gables
  tri([0.5, 1, 0.5], [0.5, 1, -0.5], [0.5, R, 0], 0);
  tri([-0.5, 1, -0.5], [-0.5, 1, 0.5], [-0.5, R, 0], 0);
  // roof slopes with a little overhang
  const o = 0.04;
  const eY = 1 - o;
  quad([-0.5 - o, eY, 0.5 + o], [0.5 + o, eY, 0.5 + o], [0.5 + o, R + 0.01, 0], [-0.5 - o, R + 0.01, 0], 1);
  quad([0.5 + o, eY, -0.5 - o], [-0.5 - o, eY, -0.5 - o], [-0.5 - o, R + 0.01, 0], [0.5 + o, R + 0.01, 0], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.computeVertexNormals();
  return g;
}

function houseMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const uniforms = { uNight: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aPart;
attribute vec3 aWall;
attribute vec3 aRoof;
varying float vPart;
varying vec3 vWall;
varying vec3 vRoof;
varying vec3 vLocal;
varying vec3 vObjN;
varying float vSeed;
varying vec3 vScale;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vPart = aPart;
vWall = aWall;
vRoof = aRoof;
vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vLocal = position * vScale;
vObjN = normal;
vSeed = float(gl_InstanceID);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uNight;
varying float vPart;
varying vec3 vWall;
varying vec3 vRoof;
varying vec3 vLocal;
varying vec3 vObjN;
varying float vSeed;
varying vec3 vScale;
float cHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float ggLit = 0.0;
float ggGlass = 0.0;
if (vPart > 0.5) {
  // slates or tiles in courses, each a slightly different shade
  float along = vLocal.x;
  float course = floor((vLocal.y) / 0.13);
  float tile = cHash(vec2(floor(along / 0.3 + mod(course, 2.0) * 0.5), course + vSeed));
  diffuseColor.rgb = vRoof * (0.82 + 0.3 * tile) * (0.9 + 0.1 * smoothstep(0.0, 0.03, fract(vLocal.y / 0.13)));
} else {
  diffuseColor.rgb = vWall * (0.9 + 0.1 * cHash(vec2(floor(vLocal.y * 6.0), vSeed)));
  // windows on the street and garden faces: two per floor
  if (abs(vObjN.z) > 0.5 && vLocal.y > 0.2 && vLocal.y < vScale.y - 0.4) {
    float storey = floor(vLocal.y / 2.8);
    float fy = vLocal.y - storey * 2.8;
    float q = vScale.x * 0.25;
    float dx = min(abs(vLocal.x - q), abs(vLocal.x + q));
    float win = step(dx, 0.52) * step(0.85, fy) * step(fy, 2.35);
    float frame = win * (1.0 - step(dx, 0.46) * step(0.91, fy) * step(fy, 2.29));
    float bar = win * step(abs(fy - 1.62), 0.03);
    float id = cHash(vec2(vSeed * 3.1 + storey, sign(vLocal.x) + vObjN.z * 7.0));
    ggGlass = win * (1.0 - frame) * (1.0 - bar);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.88), max(frame, bar));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.075) + vec3(0.03) * id, ggGlass);
    ggLit = ggGlass * step(0.52, id) * (0.6 + 0.8 * cHash(vec2(id, 3.0)));
  }
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.12, ggGlass);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.62, 0.3) * ggLit * uNight * 1.1;`,
      );
  };
  mat.customProgramCacheKey = () => 'gg-houses';
  return { mat, uniforms };
}

// Chimney stack with two pots, unit size (scaled per instance).
function chimneyGeo() {
  const stack = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  stack.translate(0, 0.5, 0);
  const pots = [];
  for (const x of [-0.22, 0.22]) {
    const p = new THREE.CylinderGeometry(0.12, 0.15, 0.3, 8, 1).toNonIndexed();
    p.translate(x, 1.15, 0);
    pots.push(p);
  }
  const parts = [stack, ...pots];
  const pos = [];
  const col = [];
  for (const [i, g] of parts.entries()) {
    const a = g.attributes.position.array;
    pos.push(...a);
    const c = i === 0 ? [1, 1, 1] : [1.25, 0.8, 0.62];
    for (let k = 0; k < a.length / 3; k++) col.push(...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const WALLS = ['#b8a077', '#c2aa80', '#9c5b44', '#8e4f3c', '#ddd5c2', '#e8e3d6', '#cbb9a2', '#a9876a'];
const ROOFS = ['#4a4f57', '#3f444c', '#565a60', '#8a4b37', '#7b5344'];

export function cityBelow(layout, rnd, kit, quality) {
  const group = new THREE.Group();
  const low = quality && quality.tier === 'low';
  const houses = [];
  const chimneys = [];
  const trees = [];
  const lamps = [];
  const rows = [
    { z: -19, face: 1 },
    { z: -48, face: -1 },
    { z: -62, face: 1 },
    { z: -92, face: -1 },
    { z: -106, face: 1 },
    { z: -137, face: -1 },
    { z: -151, face: 1 },
  ];
  const col = (hex) => new THREE.Color(hex);
  for (const [ri, row] of rows.entries()) {
    let x = -150 + rnd() * 20;
    while (x < 150) {
      // a terrace of 4-9 houses, then a side street
      const n = 4 + Math.floor(rnd() * 6);
      const d = 8.5 + rnd() * 2;
      const eaves = rnd() < 0.2 ? 8.4 + rnd() * 0.8 : 5.6 + rnd() * 1.1;
      const wall = WALLS[Math.floor(rnd() * WALLS.length)];
      const roof = ROOFS[Math.floor(rnd() * ROOFS.length)];
      for (let i = 0; i < n; i++) {
        const w = 4.8 + rnd() * 1.4;
        const cx = x + w / 2;
        const zc = row.z - (row.face * d) / 2;
        // a few houses in each terrace painted or re-roofed differently
        const wc = rnd() < 0.25 ? WALLS[Math.floor(rnd() * WALLS.length)] : wall;
        const rc = rnd() < 0.15 ? ROOFS[Math.floor(rnd() * ROOFS.length)] : roof;
        const e = eaves + (rnd() - 0.5) * 0.15;
        houses.push({ cx, zc, w, d, e, wc, rc });
        if (i > 0 || rnd() < 0.5) {
          // stacks stand on the party walls, near the ridge
          const dz = (rnd() - 0.5) * d * 0.3;
          const roofY = e + 0.5 * e * (1 - Math.abs(dz) / (d / 2));
          chimneys.push({ x, z: zc + dz, y: STREET + roofY - 0.6, s: 0.6 + rnd() * 0.2 });
        }
        x += w;
      }
      // street trees in front, garden trees behind
      for (let k = 0; k < 3; k++) {
        if (rnd() < 0.75) trees.push({ x: x - rnd() * n * 5, z: row.z + row.face * (4 + rnd() * 2), h: 7 + rnd() * 4, r: 2.2 + rnd() * 1.2 });
        if (rnd() < 0.8) trees.push({ x: x - rnd() * n * 5, z: row.z - row.face * (d + 5 + rnd() * 8), h: 6 + rnd() * 5, r: 2.5 + rnd() * 1.5 });
      }
      x += 10 + rnd() * 6;
    }
    if (ri === 0) {
      // our own street: lamp posts along both pavements
      for (let lx = -60; lx <= 60; lx += 14 + rnd() * 4) {
        lamps.push(new THREE.Vector3(lx, STREET + 5.2, -11.5));
        lamps.push(new THREE.Vector3(lx + 7, STREET + 5.2, -18.3));
      }
    }
  }

  // ---- houses: one instanced mesh
  const hg = houseGeo();
  const count = houses.length;
  const aWall = new Float32Array(count * 3);
  const aRoof = new Float32Array(count * 3);
  const { mat, uniforms } = houseMaterial();
  const mesh = new THREE.InstancedMesh(hg, mat, count);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  houses.forEach((h, i) => {
    // the unit house's ridge is half its eaves height above the eaves
    // (about a 35 degree pitch for these depths)
    m.makeScale(h.w, h.e, h.d);
    m.setPosition(h.cx, STREET, h.zc);
    mesh.setMatrixAt(i, m);
    c.set(h.wc).toArray(aWall, i * 3);
    c.set(h.rc).toArray(aRoof, i * 3);
  });
  hg.setAttribute('aWall', new THREE.InstancedBufferAttribute(aWall, 3));
  hg.setAttribute('aRoof', new THREE.InstancedBufferAttribute(aRoof, 3));
  mesh.frustumCulled = false;
  group.add(mesh);

  // ---- chimneys
  const cm = new THREE.InstancedMesh(chimneyGeo(), new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true }), chimneys.length);
  chimneys.forEach((ch, i) => {
    m.makeScale(ch.s, 1.3, ch.s * 1.5);
    m.setPosition(ch.x, ch.y, ch.z);
    cm.setMatrixAt(i, m);
    cm.setColorAt(i, c.set(WALLS[i % 4]));
  });
  cm.frustumCulled = false;
  group.add(cm);

  // ---- trees: big leaf cards
  const cards = new Cards();
  const P = new THREE.Vector3();
  const per = low ? 24 : 44;
  for (const t of trees) {
    const cy = STREET + t.h - t.r * 0.7;
    for (let i = 0; i < per; i++) {
      const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const rr = Math.pow(rnd(), 0.3);
      P.set(t.x + d.x * t.r * rr, cy + d.y * t.r * 0.8 * rr, t.z + d.z * t.r * rr);
      const n = new THREE.Vector3(d.x, d.y + 0.4, d.z).normalize();
      const s = 1.5 + rnd() * 0.9;
      cards.add(P.clone(), n.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)), rnd() * 6.28, s, s, 2, n, (0.5 + 0.5 * rr) * (0.8 + 0.4 * Math.max(0, n.y)));
    }
  }
  const leaves = new THREE.Mesh(cards.geometry(), kit.leaves());
  group.add(leaves);

  // ---- the ground far below: gardens, pavements and roads
  const size = 420;
  const gg = new THREE.PlaneGeometry(size, size, 140, 140);
  gg.rotateX(-Math.PI / 2);
  gg.translate(0, STREET, -size / 2 + 5);
  const p = gg.attributes.position;
  const gc = new Float32Array(p.count * 3);
  const roads = [-15, -55, -99, -144];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    let k = [0.36, 0.44, 0.24]; // gardens
    const nz = noise2(x * 0.08, z * 0.08);
    k = [k[0] * (0.8 + 0.4 * nz), k[1] * (0.8 + 0.4 * nz), k[2] * (0.8 + 0.4 * nz)];
    for (const rz of roads) {
      const dz = Math.abs(z - rz);
      if (dz < 3.2) k = [0.2, 0.2, 0.21];
      else if (dz < 4.8) k = [0.5, 0.49, 0.46];
    }
    gc.set(k, i * 3);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  group.add(ground);

  // ---- hills on the horizon
  const hills = new THREE.Mesh(treeLine({ z: -320, x0: -420, x1: 420, hMin: 18, hMax: 42, bend: 0.0006 }, rnd), kit.canopy());
  hills.position.y = STREET;
  group.add(hills);

  // ---- street lamps: small warm heads, haloed at night
  const lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#e8e0d0', emissive: new THREE.Color('#ffb46a'), emissiveIntensity: 0 });
  const lm = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
  lamps.forEach((l, i) => {
    m.makeTranslation(l.x, l.y, l.z);
    lm.setMatrixAt(i, m);
  });
  group.add(lm);
  const glowGeo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  glowGeo.index = quad.index;
  glowGeo.setAttribute('position', quad.attributes.position);
  glowGeo.setAttribute('uv', quad.attributes.uv);
  const off = new Float32Array(lamps.length * 3);
  lamps.forEach((l, i) => off.set([l.x, l.y, l.z], i * 3));
  glowGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  glowGeo.instanceCount = lamps.length;
  const glowMat = new THREE.ShaderMaterial({
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
  mv.xy += position.xy * 3.2;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uLevel;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  gl_FragColor = vec4(vec3(1.0, 0.64, 0.32) * (exp(-r * r * 7.0) * 0.5 + exp(-r * r * 60.0)) * uLevel, 1.0);
}`,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.frustumCulled = false;
  glow.visible = false;
  group.add(glow);

  for (const o of [mesh, cm, leaves, ground, hills, lm]) {
    o.castShadow = false;
    o.receiveShadow = false;
  }
  return {
    group,
    update(dt, t, night) {
      uniforms.uNight.value = night;
      lampMat.emissiveIntensity = night * 4;
      glow.visible = night > 0.02;
      glowMat.uniforms.uLevel.value = night * 0.8;
    },
  };
}
