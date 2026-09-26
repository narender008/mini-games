// Seaside pines for the night bay: tall, leaning maritime pines with bare,
// bending trunks and open crowns of needle clumps held out on crooked limbs,
// the shape that stands along sandy coasts. Trunks, limbs, needles and the
// dark heart of each clump all come from one painted atlas, so each variant
// is a single instanced draw; the tops sway gently in the night breeze.
import * as THREE from 'three';
import { rng } from '../config.js';
import { canvasTexture, merge } from './common.js';

let shared = null;

// A needle spray over most of the atlas: solid dark clumps of needles with
// long single needles fringing them, so the card keeps its coverage even far
// away in the smaller mipmaps. Solid patches in the bottom corners are for
// bark (left) and the shadowy heart of a clump (right).
function atlas() {
  return canvasTexture(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(19);
    g.fillStyle = '#5a4535';
    g.fillRect(0, h - 26, 26, 26);
    g.fillStyle = '#1e2b16';
    g.fillRect(w - 26, h - 26, 26, 26);
    const cx = w / 2;
    const needles = (x, y, len, n, a0, spread, light) => {
      for (let i = 0; i < n; i++) {
        const a = a0 + (r() - 0.5) * spread;
        const l = len * (0.55 + r() * 0.55);
        g.strokeStyle = `hsl(${86 + r() * 30}, ${26 + r() * 20}%, ${light + r() * 14}%)`;
        g.lineWidth = 1.6 + r() * 1.2;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 - 4, x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
    };
    const clump = (x, y, rad) => {
      // the dense middle of a tuft, then needles bursting out of it
      g.fillStyle = `hsl(${95 + r() * 15}, ${28 + r() * 10}%, ${10 + r() * 4}%)`;
      g.beginPath();
      for (let k = 0; k <= 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const rr = rad * (0.7 + r() * 0.35);
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8);
      }
      g.fill();
      needles(x, y, rad * 1.9, 34, -Math.PI / 2, Math.PI * 2, 12);
      needles(x, y - rad * 0.3, rad * 1.5, 16, -Math.PI / 2, 2.2, 20);
    };
    g.strokeStyle = '#3d2f22';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx, h - 34);
    g.lineTo(cx, 60);
    g.stroke();
    for (let i = 0; i < 11; i++) {
      const y = h - 70 - i * 36 + r() * 10;
      const side = i % 2 ? 1 : -1;
      const ex = cx + side * (26 + r() * 44);
      const ey = y - 16 - r() * 20;
      g.strokeStyle = '#3a2c20';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx, y);
      g.lineTo(ex, ey);
      g.stroke();
      clump(ex, ey, 26 + r() * 10);
      clump((cx + ex) / 2, (y + ey) / 2 - 6, 20 + r() * 6);
    }
    clump(cx, 70, 36);
  });
}

function materials() {
  if (shared) return shared;
  const mat = new THREE.MeshStandardMaterial({ map: atlas(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 });
  const time = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.19 + instanceMatrix[3].z * 0.27;
#else
  float ph = 0.0;
#endif
  float gust = 0.65 + 0.35 * sin(uTime * 0.23 + ph * 0.4);
  transformed.x += sin(uTime * 0.8 + ph) * 0.22 * sway * gust;
  transformed.z += cos(uTime * 0.63 + ph * 1.4) * 0.15 * sway * gust;`,
      );
  };
  mat.customProgramCacheKey = () => 'bay-pine';
  shared = { mat, time };
  return shared;
}

const BARK_UV = [0.04, 0.025];
const CORE_UV = [0.96, 0.025];

// set every uv of a geometry to one texel of the atlas, and add a sway value
function solidUV(g, uv, sway) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) a.set(uv, i * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  g.setAttribute('sway', new THREE.BufferAttribute(new Float32Array(n).fill(sway), 1));
  return g;
}

// a tapered tube along a list of points (few sides; bark uv)
function limb(points, r0, r1, sides, sway0, sway1) {
  const pos = [];
  const idx = [];
  const n = points.length;
  const up = new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3();
  const s1 = new THREE.Vector3();
  const s2 = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = points[i];
    t.subVectors(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
    s1.crossVectors(t, Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    s2.crossVectors(t, s1);
    const rr = r0 + (r1 - r0) * (i / (n - 1));
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      pos.push(p.x + (s1.x * Math.cos(a) + s2.x * Math.sin(a)) * rr, p.y + (s1.y * Math.cos(a) + s2.y * Math.sin(a)) * rr, p.z + (s1.z * Math.cos(a) + s2.z * Math.sin(a)) * rr);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      idx.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  solidUV(out, BARK_UV, 0);
  // sway grows along the limb, from its base to its tip
  const swa = out.attributes.sway.array;
  const p = out.attributes.position;
  const y0 = points[0].y;
  const y1 = points[n - 1].y;
  for (let i = 0; i < p.count; i++) swa[i] = sway0 + (sway1 - sway0) * Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0 || 1)));
  return out;
}

// one needle card from the origin out along +x, gently arched
function card(len, width) {
  const segs = 3;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * len;
    const y = Math.sin(t * Math.PI) * len * 0.08 - t * t * len * 0.12;
    for (const s of [-1, 1]) {
      pos.push(x, y, s * width * 0.5 * (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.3 + 0.2) * Math.PI)));
      uv.push(0.5 + s * 0.5, 0.07 + t * 0.92);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

function pineVariant(seed) {
  const r = rng(seed);
  const H = 8.5 + r() * 4;
  const lean = 0.6 + r() * 1.6;
  const la = r() * Math.PI * 2;
  const lx = Math.cos(la);
  const lz = Math.sin(la);
  // a trunk that leans and straightens a little towards the top
  const trunkPts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const off = lean * (t * 1.4 - t * t * 0.6);
    trunkPts.push(new THREE.Vector3(lx * off, -0.5 + t * (H + 0.5), lz * off));
  }
  const parts = [limb(trunkPts, 0.26, 0.09, 6, 0, 0.25)];
  const top = trunkPts[5];
  // clumps of needles on crooked limbs round the top third
  const clumps = 5 + Math.floor(r() * 2);
  for (let c = 0; c < clumps; c++) {
    const a = (c / clumps) * Math.PI * 2 + r() * 0.8;
    const drop = c === 0 ? 0 : 0.6 + r() * H * 0.3;
    const reach = c === 0 ? 0.3 : 1.4 + r() * 2.2;
    const base = new THREE.Vector3(top.x - lx * lean * 0.1 * (drop / H), top.y - drop, top.z - lz * lean * 0.1 * (drop / H));
    const end = new THREE.Vector3(base.x + Math.cos(a) * reach, base.y + 0.5 + r() * 0.8, base.z + Math.sin(a) * reach);
    const sw = Math.min(1, end.y / H) ** 2;
    if (c > 0) parts.push(limb([base, base.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.25, 0)), end], 0.09, 0.04, 4, sw * 0.4, sw));
    // the clump: cards radiating up and out, round a dark heart
    const size = (1.9 + r() * 0.9) * (c === 0 ? 1.25 : 1);
    const n = 5;
    for (let k = 0; k < n; k++) {
      const g = card(size * (0.8 + r() * 0.4), size * 0.95);
      g.rotateX((r() - 0.5) * 1.2);
      g.rotateZ(0.15 + r() * 0.55);
      g.rotateY((k / n) * Math.PI * 2 + r() * 0.5);
      g.translate(end.x, end.y, end.z);
      g.setAttribute('sway', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(sw), 1));
      parts.push(g);
    }
    const heart = new THREE.IcosahedronGeometry(size * 0.42, 0);
    heart.scale(1, 0.6, 1);
    heart.translate(end.x, end.y + size * 0.12, end.z);
    parts.push(solidUV(heart, CORE_UV, sw));
  }
  const geo = merge(parts.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'sway'].includes(k)) g.deleteAttribute(k);
    return g;
  }));
  return geo;
}

// Plant pines at spots [{ x, y, z, ry, s }]; one instanced mesh per variant.
export function makeSeaPines(spots, seed = 1) {
  const { mat, time } = materials();
  const group = new THREE.Group();
  group.name = 'sea-pines';
  const variants = [pineVariant(seed * 7 + 1), pineVariant(seed * 7 + 2), pineVariant(seed * 7 + 3)];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  variants.forEach((geo, k) => {
    const mine = spots.filter((_, i) => i % variants.length === k);
    if (!mine.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
    mine.forEach((it, i) => {
      e.set(0, it.ry ?? 0, 0);
      q.setFromEuler(e);
      p.set(it.x, it.y, it.z);
      s.setScalar(it.s ?? 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  group.userData.update = (t) => {
    time.value = t;
  };
  return group;
}

// ------------------------------------------------------------ distant woods

// Two painted trees side by side: a tall fir with tiers of drooping boughs
// (left) and a round-headed pine (right), dark green, a little moonlit at
// the top.
function woodsAtlas() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(29);
    const blob = (x, y, rx, ry, l) => {
      g.fillStyle = `hsl(${100 + r() * 30}, ${24 + r() * 16}%, ${l}%)`;
      g.beginPath();
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const rr = 0.72 + r() * 0.4;
        g.lineTo(x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr);
      }
      g.fill();
    };
    // the fir: narrow trunk, boughs widening down the tree
    const fx = 128;
    g.fillStyle = '#2a2018';
    g.fillRect(fx - 4, 60, 8, h - 60);
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const y = 22 + t * (h - 70);
      const half = 8 + t * 104 * (0.85 + r() * 0.3);
      for (const s of [-1, 1]) {
        g.fillStyle = `hsl(${105 + r() * 25}, ${25 + r() * 12}%, ${8 + r() * 5}%)`;
        g.beginPath();
        g.moveTo(fx, y - 6);
        g.quadraticCurveTo(fx + s * half * 0.6, y - 4 - r() * 6, fx + s * half, y + 10 + r() * 14);
        g.lineTo(fx + s * half * 0.55, y + 18 + r() * 8);
        g.lineTo(fx, y + 16);
        g.fill();
      }
      if (r() < 0.6) blob(fx + (r() - 0.5) * half, y + 6, 10 + r() * 8, 5, 13 + r() * 6);
    }
    // the pine: a bare trunk up to a broad head of needle clumps
    const px = 384;
    g.strokeStyle = '#2e241b';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(px, h);
    g.quadraticCurveTo(px + 10, h * 0.6, px - 6, h * 0.32);
    g.stroke();
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI;
      const d = r();
      blob(px + Math.cos(a) * d * 100, 170 - Math.sin(a) * d * 110 + r() * 60, 30 + r() * 26, 20 + r() * 14, 8 + r() * 6);
    }
    for (let i = 0; i < 12; i++) blob(px + (r() - 0.6) * 150, 70 + r() * 90, 18 + r() * 14, 11 + r() * 8, 15 + r() * 7);
  });
}

let woodsShared = null;
function woodsMaterial() {
  if (woodsShared) return woodsShared;
  const mat = new THREE.MeshStandardMaterial({ map: woodsAtlas(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float variant;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv.x += variant * 0.5;');
  };
  mat.customProgramCacheKey = () => 'bay-woods';
  woodsShared = mat;
  return mat;
}

// three upright cards crossed through the trunk, their normals turned
// outwards and up so the tree shades like a rounded mass, not a flat board
function woodsGeometry() {
  const pos = [];
  const nrm = [];
  const uv = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const quad = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
    for (const [u, v] of quad) {
      pos.push(u * 0.5 * c, v, u * 0.5 * s);
      const n = new THREE.Vector3(u * c * 0.75, 0.65, u * s * 0.75).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push((u + 1) * 0.25, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Plant distant woods at spots [{ x, y, z, ry, s, pine }]: one draw per
// quarter of the map, so the quarters out of view are skipped.
export function makeWoods(spots, seed = 1) {
  const r = rng(seed);
  const mat = woodsMaterial();
  const geo = woodsGeometry();
  const group = new THREE.Group();
  group.name = 'woods';
  const quarters = [[], [], [], []];
  for (const s of spots) quarters[(s.x > 0 ? 1 : 0) + (s.z > 0 ? 2 : 0)].push(s);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  for (const list of quarters) {
    if (!list.length) continue;
    const g = geo.clone();
    g.setAttribute('variant', new THREE.InstancedBufferAttribute(new Float32Array(list.map((s) => (s.pine ? 1 : 0))), 1));
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((s, i) => {
      const H = (s.pine ? 11 : 15) * s.s;
      q.setFromAxisAngle(up, s.ry);
      p.set(s.x, s.y, s.z);
      sc.set(H * (s.pine ? 0.75 : 0.5), H, H * (s.pine ? 0.75 : 0.5));
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
      c.setHSL(0.26 + r() * 0.08, 0.3, 0.55 + r() * 0.25);
      mesh.setColorAt(i, c);
    });
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
