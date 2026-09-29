// Leafy plants for the wet garden and the forest floor: big hosta-like leaf
// rosettes, ferns with real leaflets, and leafy shrubs. Every leaf is real,
// curved geometry (a midrib fold, an arch and a drooping tip), instanced by
// the hundred: one draw per plant shape. The leaves are glossy (rain, dew),
// glow a little when the light is behind them, nod in the wind, and are dug
// away or lifted with the ground by craters, like the grass and flowers.
import * as THREE from 'three';
import { mergeGeometries } from 'three-gltf/utils/BufferGeometryUtils.js';
import { CRATER_GLSL } from '../terrain.js';
import { BLAST_GLSL, blastUniforms } from './react.js';
import { rng } from '../config.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// ------------------------------------------------------------------ geometry

// One leaf of length 1 growing along +x from the origin: it rises at `pitch`
// and bends down by `curl` radians along its length; a fold along the
// midrib lifts the edges. aLeaf carries (along, across) for the veins.
function leafParts({ width = 0.5, pitch = 0.9, curl = 0.9, fold = 0.25, segL = 12, segW = 4, tone = 1, blunt = false, ruffle = 0.05, seed = 1 }) {
  const cols = segW * 2 + 1;
  const pos = [];
  const col = [];
  const lf = [];
  const idx = [];
  const c = Math.max(curl, 1e-3);
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    const ang = pitch - c * t;
    const pr = (Math.sin(pitch) - Math.sin(ang)) / c;
    const py = (Math.cos(ang) - Math.cos(pitch)) / c;
    const nr = -Math.sin(ang);
    const ny = Math.cos(ang);
    // an ovate blade: broadest a third of the way along, pointed tip, a short stalk
    const prof = blunt ? Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.5) * (0.3 + 0.7 * Math.min(1, t / 0.2)) : Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.8) * (0.25 + 0.75 * Math.min(1, t / 0.14));
    const w = width * 0.5 * prof;
    for (let j = -segW; j <= segW; j++) {
      const s = j / segW;
      // a cupped blade: the midrib a little sunken between two rising halves, a crease down the middle, and a wavy edge
      const cup = 0.3 * Math.abs(s) + 0.7 * s * s;
      const wave = ruffle * w * Math.pow(Math.abs(s), 2.4) * Math.sin(t * 16 + seed * 3.7 + s * 2.5);
      const lift = cup * w * fold * 1.5 + wave;
      pos.push(pr + nr * lift, py + ny * lift - s * s * w * 0.1, s * w);
      const k = tone * (0.55 + 0.45 * t) * (1 - 0.14 * Math.abs(s));
      col.push(k, k, k * (0.92 + 0.08 * (1 - t)));
      lf.push(t, s);
    }
    if (i < segL) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
  }
  return { pos, col, lf, idx };
}

function toGeometry({ pos, col, lf, idx }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(lf, 2));
  g.setIndex(idx);
  return g;
}

function placeLeaf(g, { yaw, len, base = 0, y0 = 0, tilt = 0 }) {
  g.scale(len, len, len);
  if (tilt) g.rotateX(tilt);
  g.translate(base, y0, 0);
  g.rotateY(yaw);
  return g;
}

// a rosette of broad leaves (a hosta, a canna): tall ones inside, low ones outside
function rosetteGeometry(seed, { leaves = 9, width = 0.62, pitch = [1.25, 0.3], curl = [0.5, 1.3], len = [0.62, 1], ring = 0.05, fold = 0.28, blunt = false }) {
  const R = rng(seed * 313 + 7);
  const parts = [];
  for (let k = 0; k < leaves; k++) {
    const f = leaves > 1 ? k / (leaves - 1) : 0;
    const g = toGeometry(leafParts({ width: width * (0.85 + R() * 0.3), pitch: pitch[0] + (pitch[1] - pitch[0]) * Math.pow(f, 0.8) + (R() - 0.5) * 0.25, curl: curl[0] + (curl[1] - curl[0]) * f + (R() - 0.5) * 0.3, fold, tone: 0.8 + R() * 0.35, segL: blunt ? 7 : 12, segW: blunt ? 3 : 4, blunt, ruffle: blunt ? 0 : 0.05 + R() * 0.05, seed: R() * 9 }));
    placeLeaf(g, { yaw: k * 2.39996 + (R() - 0.5) * 0.3, len: (len[0] + (len[1] - len[0]) * f) * (0.9 + R() * 0.2), base: ring });
    parts.push(g);
  }
  return finish(parts);
}

// a leafy shrub: many smaller leaves flung out of a short trunk, every way
function shrubGeometry(seed, { leaves = 34, width = 0.6 }) {
  const R = rng(seed * 577 + 3);
  const parts = [];
  for (let k = 0; k < leaves; k++) {
    const f = R();
    const g = toGeometry(leafParts({ width: width * (0.85 + R() * 0.3), pitch: 1.35 - 1.1 * f + (R() - 0.5) * 0.3, curl: 0.35 + R() * 0.7, fold: 0.3, tone: 0.75 + R() * 0.4, segL: 7, segW: 2, ruffle: 0.04, seed: R() * 9 }));
    placeLeaf(g, { yaw: R() * Math.PI * 2, len: 0.5 * (1.05 - 0.3 * f) * (0.8 + R() * 0.4), base: 0.03 + 0.2 * f, y0: 0.04 + 0.16 * (1 - f) * R() });
    parts.push(g);
  }
  return finish(parts);
}

// one fern frond of length 1: an arching rachis with pairs of leaflets swept
// forward along it, longest a third of the way up
function frondPart({ leaflets = 15, leafLen = 0.24, pitch = 0.9, curl = 1, R }) {
  const pos = [];
  const col = [];
  const lf = [];
  const idx = [];
  const c = Math.max(curl, 1e-3);
  const at = (t, out) => {
    const ang = pitch - c * t;
    out[0] = (Math.sin(pitch) - Math.sin(ang)) / c;
    out[1] = (Math.cos(ang) - Math.cos(pitch)) / c;
    out[2] = Math.cos(ang);
    out[3] = Math.sin(ang);
    return out;
  };
  const P = [0, 0, 0, 0];
  const A = [0, 0, 0, 0];
  const B = [0, 0, 0, 0];
  const vert = (x, y, z, k) => {
    pos.push(x, y, z);
    col.push(k, k, k * 0.9);
    lf.push(0, 0);
    return pos.length / 3 - 1;
  };
  // the rachis: a thin flat strip
  const SEG = 8;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    at(t, P);
    const hw = 0.008 * (1 - t * 0.8);
    vert(P[0], P[1], -hw, 0.95);
    vert(P[0], P[1], hw, 0.95);
    if (i < SEG) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const d = (0.88 / leaflets) * 0.6;
  for (let n = 0; n < leaflets; n++) {
    const t = 0.1 + (0.9 * (n + 0.5)) / leaflets;
    const l = leafLen * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)) * (1.05 - 0.4 * t);
    at(t, P);
    at(Math.max(0, t - d), A);
    at(Math.min(1, t + d), B);
    for (const sg of [-1, 1]) {
      const sweep = 0.9 + (R() - 0.5) * 0.2;
      // the leaflet's direction: out sideways, swept towards the tip, drooping
      const dx = P[2] * Math.sin(sweep);
      const dy = P[3] * Math.sin(sweep) - 0.2;
      const dz = sg * Math.cos(sweep);
      const tone = 0.78 + R() * 0.3 + 0.2 * t;
      const tipK = tone * 1.08;
      const cx = P[0] + dx * l;
      const cy = P[1] + dy * l;
      const cz = dz * l;
      const va = vert(A[0], A[1], sg * 0.006, tone * 0.85);
      const vb = vert(B[0], B[1], sg * 0.006, tone * 0.85);
      // the blade swells a little between base and tip
      const mx = (A[0] + cx) * 0.5 + (P[2] * 0.0);
      const bx = (B[0] - A[0]) * 0.32;
      const by = (B[1] - A[1]) * 0.32;
      const vd = vert(mx - bx + dx * l * 0.05, (A[1] + cy) * 0.5 - by, cz * 0.5 + sg * 0.004, tone);
      const ve = vert((B[0] + cx) * 0.5 + bx + dx * l * 0.05, (B[1] + cy) * 0.5 + by, cz * 0.5 + sg * 0.004, tone);
      const vc = vert(cx, cy, cz, tipK);
      if (sg > 0) idx.push(va, vb, ve, va, ve, vd, vd, ve, vc);
      else idx.push(va, ve, vb, va, vd, ve, vd, vc, ve);
    }
  }
  return { pos, col, lf, idx };
}

function fernGeometry(seed, { fronds = 10, leaflets = 15, leafLen = 0.24 }) {
  const R = rng(seed * 811 + 5);
  const parts = [];
  for (let k = 0; k < fronds; k++) {
    const f = fronds > 1 ? k / (fronds - 1) : 0;
    const g = toGeometry(frondPart({ leaflets, leafLen, pitch: 1.05 - 0.75 * Math.pow(f, 0.85) + (R() - 0.5) * 0.2, curl: 0.7 + R() * 0.7 + f * 0.3, R }));
    placeLeaf(g, { yaw: k * 2.39996 + (R() - 0.5) * 0.3, len: (0.62 + 0.38 * f) * (0.9 + R() * 0.2), base: 0.03 });
    parts.push(g);
  }
  return finish(parts);
}

function finish(parts) {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const KINDS = {
  hosta: (seed) => rosetteGeometry(seed, { leaves: 9, width: 0.66, ring: 0.05 }),
  // clover: a few round leaves lying nearly flat
  clover: (seed) => rosetteGeometry(seed, { leaves: 6, width: 0.95, pitch: [0.5, 0.12], curl: [0.1, 0.4], len: [0.7, 1], ring: 0.02, fold: 0.12, blunt: true }),
  canna: (seed) => rosetteGeometry(seed, { leaves: 7, width: 0.42, pitch: [1.35, 0.55], curl: [0.35, 0.9], len: [0.7, 1], ring: 0.03 }),
  fern: (seed) => fernGeometry(seed, { fronds: 10, leaflets: 15, leafLen: 0.24 }),
  shrub: (seed) => shrubGeometry(seed, { leaves: 34, width: 0.6 }),
};

// ------------------------------------------------------------------ material

function plantMaterial(uniforms, { veins, rough }) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: rough, metalness: 0 });
  if (veins) mat.defines = { LEAF_VEINS: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
${CRATER_GLSL}
${BLAST_GLSL}
uniform float uTime;
uniform float uWind;
attribute vec2 aLeaf;
varying vec2 vLeaf;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
vLeaf = aLeaf;
{
  vec3 root = instanceMatrix[3].xyz;
  vec4 dm = texture2D(tDeform, deformUv(root.xz));
  float gone = smoothstep(0.35, 0.7, dm.g);
  float sc = length(instanceMatrix[1].xyz);
  float k = max(mvPosition.y - root.y, 0.0) / max(sc, 0.02);
  // nod in the wind, the higher the more
  float sway = (uWind * 0.6 + sin(uTime * 1.5 + root.x * 9.0 + root.z * 7.0) * 0.09) * k * k * sc * 0.16;
  mvPosition.x += sway;
  mvPosition.z += sin(uTime * 1.2 + root.x * 13.0) * k * k * sc * 0.03;
  mvPosition.y += sin(uTime * 2.6 + mvPosition.x * 31.0 + mvPosition.z * 17.0) * sc * 0.006 * k;
  // thrown back by a burst nearby, then swinging upright again
  vec2 kick = blastSway(root.xz, uTime, 1.8, 1.7) * min(k, 1.3) * min(k, 1.3) * min(sc, 0.3) * 0.3;
  mvPosition.xz += kick;
  mvPosition.y -= dot(kick, kick) / max(sc, 0.02) * 1.5;
  mvPosition.xyz = root + (mvPosition.xyz - root) * (1.0 - gone);
  mvPosition.y += deformHeight(root.xz);
}
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLeaf;\nuniform float uGlow;\nuniform float uTrans;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
#ifdef LEAF_VEINS
{
  // a pale midrib and side veins, a little yellower than the blade
  float ax = abs(vLeaf.y);
  float mid = 1.0 - smoothstep(0.0, 0.06, ax);
  float sv = abs(fract(vLeaf.x * 8.0 - ax * 2.2) - 0.5);
  float side = (1.0 - smoothstep(0.0, 0.1, sv)) * smoothstep(0.08, 0.25, ax) * (1.0 - smoothstep(0.75, 1.0, ax));
  side *= 1.0 - smoothstep(0.04, 0.1, fwidth(vLeaf.x * 8.0));
  diffuseColor.rgb *= 1.0 + mid * 0.3 + side * 0.12;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.1, 0.7), mid * 0.5);
}
#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
#ifdef LEAF_VEINS
{
  // the midrib and side veins as raised ribs in the normal, so the sky and the sun catch them on the wet blade
  float ax = abs(vLeaf.y);
  float rib = 1.0 - smoothstep(0.0, 0.05, ax);
  float sv = abs(fract(vLeaf.x * 8.0 - ax * 2.2) - 0.5);
  float sideV = (1.0 - smoothstep(0.0, 0.16, sv)) * smoothstep(0.06, 0.2, ax) * (1.0 - smoothstep(0.7, 1.0, ax));
  // thin ribs that shrink to a pixel or two would only shimmer: let them fade out with distance
  rib *= 1.0 - smoothstep(0.008, 0.02, fwidth(ax));
  sideV *= 1.0 - smoothstep(0.04, 0.1, fwidth(vLeaf.x * 8.0));
  float hgt = rib * 1.0 + sideV * 0.45;
  vec2 dH = vec2(dFdx(hgt), dFdy(hgt)) * 0.55;
  vec3 sX = normalize(dFdx(-vViewPosition));
  vec3 sY = normalize(dFdy(-vViewPosition));
  vec3 R1 = cross(sY, normal);
  vec3 R2 = cross(normal, sX);
  float det = dot(sX, R1) * faceDirection;
  vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
  normal = normalize(abs(det) * normal - grad);
}
#endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
// light through thin leaves: a little everywhere, and more where a blade faces down and the sky shines through it
{
  float wy = inverseTransformDirection(normal, viewMatrix).y;
  float back = smoothstep(0.15, -0.75, wy);
  totalEmissiveRadiance += diffuseColor.rgb * (uGlow + uTrans * back) * vec3(1.0, 1.08, 0.55);
}`,
      );
  };
  mat.customProgramCacheKey = () => `plants-${veins ? 'leaf' : 'fern'}`;
  return mat;
}

// ------------------------------------------------------------------ the plants

export class Plants {
  // groups: [{ kind: 'hosta'|'canna'|'fern'|'shrub', count, area: [x0, x1, z0, z1], size: [min, max] metres (a leaf's length),
  //            colors: [hex...], weight(x, z) -> 0..1 (density), keepOut(x, z), variants }]
  // look: { rough, glow, trans } (glow: flat light through the blade, trans: extra glow on blades that face down)
  constructor({ terrain, quality, groups, look = {}, seed = 21 }) {
    const R = rng(seed);
    this.uniforms = { ...terrain.uniforms, ...blastUniforms, uTime: { value: 0 }, uWind: { value: 0 }, uGlow: { value: look.glow ?? 0.07 }, uTrans: { value: look.trans ?? 0 } };
    const mats = {
      leaf: plantMaterial(this.uniforms, { veins: true, rough: look.rough ?? 0.45 }),
      fern: plantMaterial(this.uniforms, { veins: false, rough: look.rough ?? 0.5 }),
    };
    this.meshes = [];
    this.count = 0;
    const cache = new Map();
    for (const gp of groups) {
      const variants = gp.variants ?? 3;
      const geos = [];
      for (let v = 0; v < variants; v++) {
        const key = `${gp.kind}${v}`;
        if (!cache.has(key)) cache.set(key, KINDS[gp.kind](v + 1 + (gp.geoSeed ?? 0)));
        geos.push(cache.get(key));
      }
      const total = Math.max(1, Math.round(gp.count * (gp.scaleCount === false ? 1 : quality.grass)));
      const [x0, x1, z0, z1] = gp.area;
      const [s0, s1] = gp.size;
      const items = geos.map(() => []);
      let n = 0;
      let guard = 0;
      while (n < total && guard++ < total * 40) {
        const x = x0 + R() * (x1 - x0);
        const z = z0 + R() * (z1 - z0);
        if (gp.weight && R() > gp.weight(x, z)) continue;
        if (gp.keepOut && gp.keepOut(x, z)) continue;
        items[n % variants].push({ x, z, s: s0 + (s1 - s0) * Math.pow(R(), 1.3), yaw: R() * Math.PI * 2, col: gp.colors[Math.floor(R() * gp.colors.length)], k: R() });
        n++;
      }
      geos.forEach((geo, vi) => {
        const list = items[vi];
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(geo, gp.kind === 'fern' ? mats.fern : mats.leaf, list.length);
        list.forEach((it, i) => {
          _e.set((it.k - 0.5) * 0.12, it.yaw, (R() - 0.5) * 0.12);
          _q.setFromEuler(_e);
          const y = terrain.baseAt(it.x, it.z);
          _m.compose(_p.set(it.x, y - 0.003, it.z), _q, _s.set(it.s, it.s * (0.85 + it.k * 0.3), it.s));
          mesh.setMatrixAt(i, _m);
          mesh.setColorAt(i, _c.set(it.col).multiplyScalar(0.85 + it.k * 0.3));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.name = `plants-${gp.kind}-${vi}`;
        this.meshes.push(mesh);
        this.count += list.length;
      });
    }
    this.group = new THREE.Group();
    this.group.add(...this.meshes);
    this.mats = mats;
    this._geos = [...cache.values()];
  }

  update(dt, time, world) {
    const U = this.uniforms;
    U.uTime.value = time;
    U.uWind.value += ((world.wind ?? 0) - U.uWind.value) * Math.min(1, dt * 2);
  }

  dispose() {
    for (const g of this._geos) g.dispose();
    this.mats.leaf.dispose();
    this.mats.fern.dispose();
    for (const m of this.meshes) m.dispose?.();
  }
}
