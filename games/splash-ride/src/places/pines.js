// Conifers: tall pines and spruces with tapered, barked trunks and whorls of
// drooping needle-covered branches (alpha-tested branch cards painted in
// code). A few variants are built once and scattered as instances, with a
// gentle sway in the tops.
import * as THREE from 'three';
import { rng } from '../config.js';
import { canvasTexture, instances, merge } from './common.js';

let shared = null;

function branchTexture() {
  return canvasTexture(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(17);
    const cx = w / 2;
    // twigs off the main stem, each covered in short needles
    const needles = (x0, y0, x1, y1, len, dens) => {
      const n = Math.hypot(x1 - x0, y1 - y0) * dens;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        for (const s of [-1, 1]) {
          const a = Math.atan2(y1 - y0, x1 - x0) + s * (0.9 + r() * 0.5);
          const l = len * (0.7 + r() * 0.5) * (1 - t * 0.3);
          const hue = 105 + r() * 30;
          g.strokeStyle = `hsl(${hue}, ${28 + r() * 20}%, ${14 + r() * 14}%)`;
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
          g.stroke();
        }
      }
    };
    g.strokeStyle = '#4a3a2a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx, h - 6);
    g.lineTo(cx, 20);
    g.stroke();
    needles(cx, h - 20, cx, 24, 18, 0.6);
    for (let i = 0; i < 14; i++) {
      const y = h - 40 - i * 32 + r() * 10;
      const len = (1 - i / 16) * 100 + 20;
      for (const s of [-1, 1]) {
        const ex = cx + s * len;
        const ey = y - len * (0.55 + r() * 0.25);
        g.strokeStyle = '#3e3022';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(ex, ey);
        g.stroke();
        needles(cx, y, ex, ey, 14, 0.55);
      }
    }
  });
}

function barkTexture() {
  return canvasTexture(128, 512, (g, w, h) => {
    const r = rng(9);
    g.fillStyle = '#5a4230';
    g.fillRect(0, 0, w, h);
    // plated bark: vertical furrows and reddish plates
    for (let i = 0; i < 260; i++) {
      const x = r() * w;
      const y = r() * h;
      g.fillStyle = `rgba(${120 + r() * 60}, ${70 + r() * 30}, ${45 + r() * 20}, ${0.25 + r() * 0.3})`;
      g.fillRect(x, y, 6 + r() * 14, 12 + r() * 30);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(25, 18, 12, 0.5)';
      g.fillRect(r() * w, 0, 1 + r() * 2, h);
    }
  }, { repeat: true });
}

function materials() {
  if (shared) return shared;
  const needles = new THREE.MeshStandardMaterial({ map: branchTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78 });
  needles.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.23 + instanceMatrix[3].z * 0.31;
#else
  float ph = 0.0;
#endif
  transformed.x += sin(uTime * 0.9 + ph) * 0.18 * sway;
  transformed.z += cos(uTime * 0.7 + ph * 1.3) * 0.12 * sway;`,
      );
  };
  needles.customProgramCacheKey = () => 'pine-needles';
  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 });
  const core = new THREE.MeshStandardMaterial({ color: 0x1a2616, roughness: 0.95 });
  shared = { needles, bark, core, time: { value: 0 } };
  return shared;
}

// one drooping branch card from the trunk outwards
function branchCard(len, width, droop) {
  const segs = 4;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * len;
    const y = -droop * t * t * len;
    for (const s of [-1, 1]) {
      pos.push(x, y, s * width * 0.5 * (1 - t * 0.35));
      uv.push(0.5 + s * 0.5, t);
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

function pineVariant(seed, kind) {
  const r = rng(seed);
  const height = kind === 'spruce' ? 13 + r() * 7 : 15 + r() * 8;
  const trunkR = height * 0.018;
  const trunk = new THREE.CylinderGeometry(trunkR * 0.25, trunkR, height, 9, 6);
  trunk.translate(0, height / 2 - 0.3, 0);
  const uvs = trunk.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setY(i, uvs.getY(i) * height * 0.25);
  const parts = [];
  // a spruce is branched to the ground; a pine has a bare lower trunk
  const base = kind === 'spruce' ? height * 0.12 : height * 0.42;
  const whorls = kind === 'spruce' ? 16 : 11;
  for (let k = 0; k < whorls; k++) {
    const t = k / (whorls - 1);
    const y = base + (height - base) * t;
    const reach = kind === 'spruce' ? (1 - t) * height * 0.24 + 0.4 : (Math.sin(Math.min(1, (1 - t) * 1.3) * Math.PI * 0.6)) * height * 0.2 + 0.5;
    const n = 6 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const b = branchCard(reach, reach * 0.9 + 0.5, kind === 'spruce' ? 0.35 : 0.2);
      // tilt each spray about its own length so the tree looks full from the side too
      b.rotateX((i % 2 ? 1 : -1) * (0.35 + r() * 0.45));
      b.rotateZ(kind === 'spruce' ? -0.15 : 0.05 + r() * 0.1);
      b.rotateY((i / n) * Math.PI * 2 + k * 0.7 + r() * 0.4);
      b.translate(0, y, 0);
      const sw = new Float32Array(b.attributes.position.count);
      const p = b.attributes.position;
      for (let v = 0; v < sw.length; v++) sw[v] = (p.getY(v) / height) ** 2 * Math.min(1, Math.hypot(p.getX(v), p.getZ(v)) / 2 + 0.3);
      b.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
      parts.push(b);
    }
  }
  const crown = merge(parts);
  // a dark inner cone behind the sprays so the crown reads dense, not see-through
  const coreH = height - base;
  const core = new THREE.ConeGeometry(kind === 'spruce' ? height * 0.13 : height * 0.1, coreH * 0.95, 10, 1, true);
  core.translate(0, base + coreH * 0.5, 0);
  return { trunk, crown, core, height };
}

// Plant conifers at spots [{ x, y, z, ry, s }]
export function makePines(spots, seed = 1) {
  const mats = materials();
  const group = new THREE.Group();
  group.name = 'pines';
  const variants = [pineVariant(seed * 7 + 1, 'pine'), pineVariant(seed * 7 + 2, 'spruce'), pineVariant(seed * 7 + 3, 'pine'), pineVariant(seed * 7 + 4, 'spruce')];
  variants.forEach((v, k) => {
    const mine = spots.filter((_, i) => i % variants.length === k);
    if (!mine.length) return;
    group.add(instances(v.trunk, mats.bark, mine));
    group.add(instances(v.crown, mats.needles, mine));
    group.add(instances(v.core, mats.core, mine, { shadow: false }));
  });
  group.userData.update = (t) => {
    mats.time.value = t;
  };
  return group;
}

// Distant forest: thousands of simple stacked-cone conifers with a jagged
// outline and varied greens, for the hillsides behind the shore where the
// detailed pines would cost too much. One draw, no shadows.
export function makeForest(spots, seed = 1) {
  const r = rng(seed * 13 + 5);
  const tiers = [];
  const n = 4;
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const radius = (1 - t * 0.8) * 2.6;
    const h = 5.5 - t * 1.5;
    const cone = new THREE.ConeGeometry(radius, h, 9, 1, true);
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0) {
        // ragged hem of branch tips
        const j = 0.75 + r() * 0.5;
        p.setX(i, p.getX(i) * j);
        p.setZ(i, p.getZ(i) * j);
        p.setY(i, p.getY(i) - r() * 0.6);
      }
    }
    cone.translate(0, 3 + t * 12 + h / 2, 0);
    tiers.push(cone.toNonIndexed());
  }
  const trunk = new THREE.CylinderGeometry(0.12, 0.25, 4, 5, 1, true).toNonIndexed();
  trunk.translate(0, 2, 0);
  const geo = merge([...tiers, trunk]);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const mesh = instances(geo, mat, spots, { shadow: false });
  const c = new THREE.Color();
  spots.forEach((_, i) => {
    c.setHSL(0.27 + r() * 0.07, 0.35 + r() * 0.2, 0.07 + r() * 0.06);
    mesh.setColorAt(i, c);
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = 'forest';
  return mesh;
}
