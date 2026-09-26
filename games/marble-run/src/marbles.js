// Glass marbles. Each is a clear sphere with real refraction (three.js
// transmission: the scene behind is bent through it and tinted by its body
// colour over its thickness), a crisp specular reflection of the room, and
// often something inside: a cat's-eye of twisted coloured vanes, a
// swirled ribbon, a glowing heart, or a little painted planet. The core is
// opaque, so it is drawn into the transmission pass and seen refracted and
// magnified through the glass, just like a real marble.
import * as THREE from 'three';
import { R_MARBLE } from './config.js';

// Palettes per level: body tint, core kind and colours, glow.
export const PALETTES = {
  sunny: [
    { tint: '#ff4a3c', core: null },
    { tint: '#2f7dff', core: null },
    { tint: '#3fcf5a', core: null },
    { tint: '#ffc21f', core: null },
    { tint: '#ffffff', core: 'eye', colors: ['#ff5a2a', '#ffd23a', '#2b8cff'] },
    { tint: '#ff8a2a', core: null },
    { tint: '#e8f6ff', core: 'eye', colors: ['#20b060', '#1e6cf0', '#f04040'] },
  ],
  crystal: [
    { tint: '#ffb829', core: 'glow', colors: ['#ffd76a'], glow: 2.2 },
    { tint: '#ff2fb4', core: 'glow', colors: ['#ff6ad0'], glow: 2.0 },
    { tint: '#2a5bff', core: 'glow', colors: ['#6aa0ff'], glow: 2.0 },
  ],
  storybook: [
    { tint: '#ff4b3a', core: 'swirl', colors: ['#ffd24a'] },
    { tint: '#3f86ff', core: 'swirl', colors: ['#ffffff'] },
    { tint: '#37c46a', core: 'swirl', colors: ['#ffe07a'] },
    { tint: '#ffb42a', core: 'eye', colors: ['#e0402a', '#2a70e0'] },
    { tint: '#a45cff', core: 'swirl', colors: ['#ffd0ff'] },
    { tint: '#e8f6ff', core: 'eye', colors: ['#ff4a3a', '#38b860', '#3a7aff'] },
  ],
  cosmic: [
    { tint: '#e8f0ff', core: 'planet', colors: ['#d88a3a', '#f0c070', '#8a4a20'] },
    { tint: '#e8f0ff', core: 'planet', colors: ['#2a6ad8', '#5ac0e8', '#e8f4ff'] },
    { tint: '#e8f0ff', core: 'planet', colors: ['#2a8a80', '#6ad0b0', '#1a4a50'] },
    { tint: '#d8c8ff', core: 'glow', colors: ['#b070ff'], glow: 1.4 },
    { tint: '#e8f0ff', core: 'planet', colors: ['#c8a0e8', '#7a50c0', '#f0e0ff'] },
  ],
};

export class MarbleLook {
  constructor({ quality }) {
    this.quality = quality;
    const seg = quality.tier === 'low' ? [28, 20] : [48, 32];
    this.sphere = new THREE.SphereGeometry(R_MARBLE, seg[0], seg[1]);
    this.inner = new THREE.SphereGeometry(R_MARBLE * 0.84, 36, 24);
    this.vane = eyeVane();
    this.swirl = swirlRibbon();
    this.glowCore = new THREE.SphereGeometry(R_MARBLE * 0.42, 20, 14);
    this.cache = new Map();
    this.planetTex = new Map();
  }

  glass(entry) {
    const key = `glass:${entry.tint}:${entry.core}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const tint = new THREE.Color(entry.tint);
    const clear = !entry.core || entry.core === 'eye' || entry.core === 'planet';
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.02,
      transmission: 1,
      thickness: R_MARBLE * 1.7,
      ior: 1.52,
      attenuationColor: tint,
      attenuationDistance: clear && entry.core ? 0.05 : 0.012,
      specularIntensity: 1,
      envMapIntensity: 1.35,
      dispersion: this.quality.tier === 'high' ? 0.25 : 0,
    });
    this.cache.set(key, m);
    return m;
  }

  coreMat(entry, i) {
    const key = `core:${entry.core}:${entry.colors?.[i]}:${entry.glow || 0}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = new THREE.Color(entry.colors?.[i] || '#ffffff');
    let m;
    if (entry.core === 'glow') {
      m = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(entry.glow || 1.5) });
    } else {
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.12 });
    }
    this.cache.set(key, m);
    return m;
  }

  planet(entry) {
    const key = entry.colors.join();
    if (this.planetTex.has(key)) return this.planetTex.get(key);
    const tex = planetTexture(entry.colors);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.05 });
    this.planetTex.set(key, m);
    return m;
  }

  // A marble object for palette entry `entry`, with a random turn so no two
  // look the same.
  make(entry) {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(this.sphere, this.glass(entry));
    shell.castShadow = true;
    shell.receiveShadow = false;
    g.add(shell);
    if (entry.core === 'eye') {
      const n = entry.colors.length;
      for (let i = 0; i < n; i++) {
        const v = new THREE.Mesh(this.vane, this.coreMat(entry, i));
        v.rotation.y = (i / n) * Math.PI;
        g.add(v);
      }
    } else if (entry.core === 'swirl') {
      const v = new THREE.Mesh(this.swirl, this.coreMat(entry, 0));
      g.add(v);
      const v2 = new THREE.Mesh(this.swirl, this.coreMat(entry, 0));
      v2.rotation.y = Math.PI;
      g.add(v2);
    } else if (entry.core === 'glow') {
      g.add(new THREE.Mesh(this.glowCore, this.coreMat(entry, 0)));
    } else if (entry.core === 'planet') {
      const p = new THREE.Mesh(this.inner, this.planet(entry));
      p.castShadow = false;
      g.add(p);
    }
    for (const c of g.children) if (c !== shell) c.castShadow = false;
    g.userData.entry = entry;
    return g;
  }

  dispose() {
    this.sphere.dispose();
    this.inner.dispose();
    this.vane.dispose();
    this.swirl.dispose();
    this.glowCore.dispose();
    for (const m of this.cache.values()) m.dispose();
    for (const m of this.planetTex.values()) {
      m.map.dispose();
      m.dispose();
    }
  }
}

// A cat's-eye vane: a thin twisted leaf through the middle.
function eyeVane() {
  const w = R_MARBLE * 0.62;
  const h = R_MARBLE * 1.5;
  const g = new THREE.PlaneGeometry(w, h, 6, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const t = y / h;
    // taper to points at both ends and twist a quarter turn
    const taper = Math.max(0, Math.cos(t * Math.PI)) ** 0.7;
    const a = t * Math.PI * 0.6;
    const xx = x * taper;
    p.setXYZ(i, xx * Math.cos(a), y, xx * Math.sin(a));
  }
  g.computeVertexNormals();
  return g;
}

// A swirled ribbon wound through the marble.
function swirlRibbon() {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 2.2;
    const y = (t - 0.5) * R_MARBLE * 1.4;
    const rr = R_MARBLE * 0.45 * Math.sin(t * Math.PI);
    pts.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, R_MARBLE * 0.09, 6, false);
}

// Banded, swirly planet surface, drawn once on a small canvas.
function planetTexture(colors) {
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const cols = colors.map((h) => new THREE.Color(h));
  let seed = colors.join('').length * 977;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const warp = Math.sin(u * 12.566 + ph[0] + Math.sin(v * 20 + ph[1]) * 1.5) * 0.04 + Math.sin(u * 31.4 + v * 9 + ph[2]) * 0.015;
      const band = 0.5 + 0.5 * Math.sin((v + warp) * 28 + Math.sin(v * 7) * 2);
      const band2 = 0.5 + 0.5 * Math.sin((v + warp * 1.7) * 61);
      const k = band * 0.7 + band2 * 0.3;
      const a = cols[0].clone().lerp(cols[1], k).lerp(cols[2], Math.max(0, band2 - 0.6) * 1.5);
      const o = (y * W + x) * 4;
      img.data[o] = Math.min(255, a.r * 255);
      img.data[o + 1] = Math.min(255, a.g * 255);
      img.data[o + 2] = Math.min(255, a.b * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
