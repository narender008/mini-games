// Coconut palms: curved, ringed trunks and crowns of drooping, V-folded
// fronds (a painted leaflet texture, alpha-tested) that sway in the breeze,
// with a cluster of coconuts. A few variants are built once and scattered
// as instances.
import * as THREE from 'three';
import { rng } from '../config.js';
import { canvasTexture, instances, merge } from './common.js';

let shared = null;

function frondTexture() {
  return canvasTexture(256, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(7);
    // a solid patch in the corner for the coconuts (uv 0..0.06)
    const cg = g.createRadialGradient(8, h - 8, 1, 8, h - 8, 16);
    cg.addColorStop(0, '#6d6a2c');
    cg.addColorStop(1, '#4b4a1e');
    g.fillStyle = cg;
    g.fillRect(0, h - 16, 16, 16);
    const cx = w / 2;
    // leaflets along the rachis, pointing towards the tip (v = 0 is the base at the bottom)
    for (let i = 0; i < 150; i++) {
      const t = i / 150;
      const y = h - 24 - t * (h - 40);
      const len = (Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.85 + 0.15) * (w * 0.48) * (0.85 + r() * 0.3);
      for (const side of [-1, 1]) {
        const ang = 0.55 + r() * 0.2;
        const ex = cx + side * len * Math.cos(ang * 0.6);
        const ey = y - len * Math.sin(ang) * 0.75;
        const base = 0.35 + r() * 0.2;
        const hue = 86 + r() * 22 - t * 6;
        const light = 24 + r() * 12 + (1 - t) * 4;
        g.strokeStyle = `hsl(${hue}, ${42 + r() * 18}%, ${light}%)`;
        g.lineWidth = 3.2 + r() * 1.6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx + side * 2, y);
        g.quadraticCurveTo(cx + side * len * 0.5, y - len * base * 0.4, ex, ey);
        g.stroke();
        // a dry brown tip now and then
        if (r() < 0.12) {
          g.strokeStyle = `hsl(${38 + r() * 10}, 45%, ${35 + r() * 10}%)`;
          g.lineWidth = 2.4;
          g.beginPath();
          g.moveTo(cx + side * len * 0.8, ey + len * 0.12);
          g.lineTo(ex, ey);
          g.stroke();
        }
        // midrib highlight
        g.strokeStyle = 'rgba(210, 220, 150, 0.25)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(cx + side * 2, y);
        g.quadraticCurveTo(cx + side * len * 0.5, y - len * base * 0.4, ex, ey);
        g.stroke();
      }
    }
    // the rachis
    const rg = g.createLinearGradient(0, h, 0, 0);
    rg.addColorStop(0, '#8a8a4a');
    rg.addColorStop(1, '#6a7a3a');
    g.strokeStyle = rg;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(cx, h - 20);
    g.lineTo(cx, 12);
    g.stroke();
  });
}

function barkTexture() {
  return canvasTexture(128, 512, (g, w, h) => {
    const r = rng(3);
    g.fillStyle = '#8a7a66';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2000; i++) {
      g.fillStyle = `rgba(${60 + r() * 60}, ${50 + r() * 50}, ${40 + r() * 40}, ${0.1 + r() * 0.15})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 8);
    }
    // leaf-scar rings
    for (let y = 0; y < h; y += 9 + r() * 5) {
      g.fillStyle = `rgba(55, 45, 35, ${0.35 + r() * 0.25})`;
      g.fillRect(0, y, w, 1.5 + r() * 1.5);
      g.fillStyle = 'rgba(190, 175, 150, 0.25)';
      g.fillRect(0, y + 2.5, w, 1);
    }
  }, { repeat: true });
}

function materials() {
  if (shared) return shared;
  const frond = new THREE.MeshStandardMaterial({
    map: frondTexture(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.62,
    metalness: 0,
  });
  // sway: tips move most, each palm with its own phase
  frond.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
#else
  float ph = 0.0;
#endif
  float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ph * 0.5);
  transformed.x += sin(uTime * 1.35 + ph + position.y * 0.4) * 0.12 * sway * gust;
  transformed.z += cos(uTime * 1.05 + ph * 1.3) * 0.09 * sway * gust;
  transformed.y += sin(uTime * 2.1 + ph + position.x) * 0.05 * sway * sway;`,
      );
  };
  frond.customProgramCacheKey = () => 'palm-frond';
  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95, metalness: 0 });
  shared = { frond, bark, time: { value: 0 } };
  return shared;
}

// one frond: a V-folded strip that rises then droops
function frondGeometry(length, width, lift, droop, twist) {
  const segs = 12;
  const pos = [];
  const uv = [];
  const sway = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const s = t * length;
    const y = s * lift - droop * s * s;
    const z = -s;
    const wv = width * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.1) * Math.PI) ** 0.6) * (1 - t * 0.35);
    const fold = 0.28 * wv;
    const tw = twist * t;
    for (const k of [-1, 0, 1]) {
      const x = k * wv * 0.5;
      const yy = y - Math.abs(k) * fold + tw * k * wv * 0.5;
      pos.push(x, yy, z);
      uv.push(0.5 + k * 0.5, 0.02 + t * 0.96);
      sway.push(t * t);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < 2; k++) {
      const a = i * 3 + k;
      const b = a + 1;
      const c = a + 3;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

function palmVariant(seed) {
  const r = rng(seed);
  const height = 6.5 + r() * 3.2;
  const lean = 0.35 + r() * 0.5;
  const bend = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.4, 0),
    new THREE.Vector3(lean * 0.15, height * 0.35, 0),
    new THREE.Vector3(lean * 0.55, height * 0.7, 0),
    new THREE.Vector3(lean, height, 0),
  ]);
  const trunk = new THREE.TubeGeometry(bend, 16, 0.17, 8, false);
  // taper: thicker base
  const p = trunk.attributes.position;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = Math.min(1, Math.max(0, (v.y + 0.4) / (height + 0.4)));
    bend.getPoint(t, c);
    const k = 1.35 - 0.5 * t + 0.6 * Math.exp(-t * 18);
    v.sub(c).multiplyScalar(k).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // uv v along the trunk in metres so the rings keep their spacing
  const uvs = trunk.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setY(i, uvs.getY(i) * height * 0.9);
  trunk.computeVertexNormals();
  const top = bend.getPoint(1);
  const parts = [];
  const n = 13 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const upper = i < 4;
    const len = (upper ? 2.3 : 3.1) + r() * 0.9;
    const f = frondGeometry(len, 1.25 + r() * 0.25, upper ? 0.9 : 0.35 + r() * 0.3, upper ? 0.12 : 0.16 + r() * 0.08, (r() - 0.5) * 0.4);
    const m = new THREE.Matrix4().makeRotationY((i / n) * Math.PI * 2 + r() * 0.4);
    f.applyMatrix4(m);
    f.translate(top.x, top.y + 0.05, top.z);
    parts.push(f);
  }
  // coconuts, textured from the solid corner of the frond texture
  for (let i = 0; i < 5; i++) {
    const s = new THREE.SphereGeometry(0.13, 8, 6).toNonIndexed();
    const a = (i / 5) * Math.PI * 2 + r();
    s.translate(top.x + Math.cos(a) * 0.22, top.y - 0.28 - r() * 0.12, top.z + Math.sin(a) * 0.22);
    const uv = s.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.02 + uv.getX(k) * 0.02, 0.003 + uv.getY(k) * 0.008);
    s.setAttribute('sway', new THREE.Float32BufferAttribute(new Float32Array(s.attributes.position.count), 1));
    parts.push(s);
  }
  const crown = merge(parts.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'sway'].includes(k)) g.deleteAttribute(k);
    return g;
  }));
  return { trunk, crown, height };
}

// Plant palms at the given spots: [{ x, y, z, ry, s }]
export function makePalms(spots, seed = 1) {
  const mats = materials();
  const group = new THREE.Group();
  group.name = 'palms';
  const variants = [palmVariant(seed * 11 + 1), palmVariant(seed * 11 + 2), palmVariant(seed * 11 + 3)];
  variants.forEach((v, k) => {
    const mine = spots.filter((_, i) => i % variants.length === k);
    if (!mine.length) return;
    group.add(instances(v.trunk, mats.bark, mine));
    group.add(instances(v.crown, mats.frond, mine));
  });
  group.userData.update = (t) => {
    mats.time.value = t;
  };
  return group;
}
