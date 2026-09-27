// Procedural textures drawn once at start-up on 2D canvases: wood grain
// (plank, beech, walnut), a tileable value noise, and paint splatters.
import * as THREE from 'three';
import { rng } from '../config.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// value noise on a periodic lattice (tileable)
export function periodicNoise(seed = 1) {
  const R = rng(seed);
  const P = 64;
  const v = new Float32Array(P * P);
  for (let i = 0; i < v.length; i++) v[i] = R();
  return (x, y, period) => {
    const sx = (x / period) * P, sy = (y / period) * P;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    const fx = sx - x0, fy = sy - y0;
    const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
    const at = (i, j) => v[(((j % P) + P) % P) * P + (((i % P) + P) % P)];
    return (at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u) * (1 - w) + (at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u) * w;
  };
}

// Wood with long grain along x: colour map and a matching roughness map.
// tone: [light, dark] sRGB hex.
export function woodTextures({ size = 512, light = 0xc89a64, dark = 0x8a5a32, seed = 3, rings = 18, knots = 1, planks = 1, splatter = 0 } = {}) {
  const w = size, h = size;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const n = periodicNoise(seed);
  const n2 = periodicNoise(seed + 7);
  const L = new THREE.Color(light);
  const D = new THREE.Color(dark);
  const R = rng(seed + 11);
  const knotList = [];
  for (let k = 0; k < knots; k++) knotList.push([R() * w, R() * h, 6 + R() * 10]);
  const rough = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const plank = Math.floor((y / h) * planks);
    const py = (y / h) * planks - plank;
    const pshift = plank * 37.1;
    for (let x = 0; x < w; x++) {
      let yy = y + n(x, y, 256) * 18 + n2(x * 0.25, y, 128) * 6;
      for (const [kx, ky, kr] of knotList) {
        const dx = (x - kx) / (kr * 2.5), dy = (y - ky) / kr;
        const d2 = dx * dx + dy * dy;
        yy += (kr * 3) / (1 + d2) * Math.sign(y - ky);
      }
      const ring = (yy / h) * rings * planks + pshift + n(x, y * 3, 256) * 0.8;
      const f = ring - Math.floor(ring);
      const band = Math.pow(Math.abs(Math.sin(f * Math.PI)), 3);
      const fine = n2(x * 0.5, y * 8, 128);
      let t = band * 0.55 + fine * 0.25 + n(x * 0.5, y * 2, 256) * 0.2;
      // plank seams
      let seam = 1;
      if (planks > 1 && (py < 0.012 || py > 0.988)) seam = 0.45;
      const i = (y * w + x) * 4;
      const r = (L.r + (D.r - L.r) * t) * seam;
      const gg = (L.g + (D.g - L.g) * t) * seam;
      const b = (L.b + (D.b - L.b) * t) * seam;
      img.data[i] = Math.pow(r, 1 / 2.2) * 255;
      img.data[i + 1] = Math.pow(gg, 1 / 2.2) * 255;
      img.data[i + 2] = Math.pow(b, 1 / 2.2) * 255;
      img.data[i + 3] = 255;
      rough[y * w + x] = 150 + t * 60 + (seam < 1 ? 40 : 0);
    }
  }
  g.putImageData(img, 0, 0);
  if (splatter) drawSplatters(g, w, h, splatter, seed + 5);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const rc = canvas(w, h);
  const rg = rc.getContext('2d');
  const ri = rg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = rough[i];
    ri.data[i * 4 + 3] = 255;
  }
  rg.putImageData(ri, 0, 0);
  const roughMap = new THREE.CanvasTexture(rc);
  roughMap.wrapS = roughMap.wrapT = THREE.RepeatWrapping;
  return { map, roughMap };
}

export const SPLAT_COLORS = ['#e8423f', '#f39a2d', '#f7d23e', '#4cbf5a', '#3f86e0', '#9058d6', '#f06fb0', '#35c4c0'];

// little drips and dots of paint, as on a well-used easel or palette
export function drawSplatters(g, w, h, count, seed = 1, colors = SPLAT_COLORS) {
  const R = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = R() * w, y = R() * h;
    const r = 1.5 + Math.pow(R(), 3) * 14;
    g.fillStyle = colors[Math.floor(R() * colors.length)];
    g.globalAlpha = 0.75 + R() * 0.25;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    const drops = Math.floor(R() * 5);
    for (let d = 0; d < drops; d++) {
      const a = R() * Math.PI * 2;
      const dd = r * (1.3 + R() * 2);
      g.beginPath();
      g.arc(x + Math.cos(a) * dd, y + Math.sin(a) * dd, r * (0.1 + R() * 0.25), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

export function noiseTexture(size = 256, seed = 1) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const n = periodicNoise(seed);
  const m = periodicNoise(seed + 3);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      img.data[i] = n(x, y, size) * 255;
      img.data[i + 1] = m(x * 2, y * 2, size) * 255;
      img.data[i + 2] = (n(x * 4, y * 4, size) * 0.5 + m(x * 8, y * 8, size) * 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
