// Tileable noise for the sky, painted once on the CPU into a small RGBA
// texture that the dome shader samples for clouds and the moon's face:
//   R  billowy cumulus shapes (inverted Worley cells blended with value noise)
//   G  finer Worley cells, used to erode cloud edges into cauliflower puffs
//   B  broad soft value noise (gaps between cloud fields, cirrus, lunar seas)
//   A  fine value noise (wisps, small craters)
import * as THREE from 'three';
import { mulberry32 } from '../../config.js';

// Distance to the nearest feature point on a wrapping grid of `cells` cells,
// inverted so cell centres are 1 (the puffs) and the seams between them 0.
function worley(size, cells, rand) {
  const fx = new Float32Array(cells * cells);
  const fy = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) {
    fx[i] = rand();
    fy[i] = rand();
  }
  const out = new Float32Array(size * size);
  const k = cells / size;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) * k;
    const iy = Math.floor(v);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * k;
      const ix = Math.floor(u);
      let best = 9;
      for (let dy = -1; dy <= 1; dy++) {
        const cy = iy + dy;
        const wy = ((cy % cells) + cells) % cells;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = ix + dx;
          const wx = ((cx % cells) + cells) % cells;
          const i = wy * cells + wx;
          const ddx = cx + fx[i] - u;
          const ddy = cy + fy[i] - v;
          const d = ddx * ddx + ddy * ddy;
          if (d < best) best = d;
        }
      }
      out[y * size + x] = 1 - Math.min(1, Math.sqrt(best));
    }
  }
  return out;
}

// Smooth value noise on a wrapping lattice, summed over `octaves`.
function valueFbm(size, cells, octaves, rand, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const c = cells << o;
    const lat = new Float32Array(c * c);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    const k = c / size;
    for (let y = 0; y < size; y++) {
      const v = y * k;
      const iy = Math.floor(v);
      let fy = v - iy;
      fy = fy * fy * (3 - 2 * fy);
      const y0 = (iy % c) * c;
      const y1 = ((iy + 1) % c) * c;
      for (let x = 0; x < size; x++) {
        const u = x * k;
        const ix = Math.floor(u);
        let fxx = u - ix;
        fxx = fxx * fxx * (3 - 2 * fxx);
        const x0 = ix % c;
        const x1 = (ix + 1) % c;
        const a = lat[y0 + x0] + (lat[y0 + x1] - lat[y0 + x0]) * fxx;
        const b = lat[y1 + x0] + (lat[y1 + x1] - lat[y1 + x0]) * fxx;
        out[y * size + x] += (a + (b - a) * fy) * amp;
      }
    }
    norm += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function stretch(a) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of a) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const s = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * s;
  return a;
}

export function createSkyNoise(size = 256) {
  const rand = mulberry32(7331);
  const w1 = worley(size, 6, rand);
  const w2 = worley(size, 12, rand);
  const w3 = worley(size, 24, rand);
  const w4 = worley(size, 48, rand);
  const vLow = valueFbm(size, 4, 4, rand);
  const vBroad = stretch(valueFbm(size, 2, 5, rand, 0.55));
  const vFine = stretch(valueFbm(size, 16, 3, rand));
  const n = size * size;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cells = w1[i] * 0.55 + w2[i] * 0.3 + w3[i] * 0.15;
    // "Perlin-Worley": value noise remapped by the cells, so puffs are round
    // but the fields they form are irregular.
    R[i] = cells * 0.62 + vLow[i] * 0.38;
    G[i] = w3[i] * 0.6 + w4[i] * 0.4;
  }
  stretch(R);
  stretch(G);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = R[i] * 255;
    data[i * 4 + 1] = G[i] * 255;
    data[i * 4 + 2] = vBroad[i] * 255;
    data[i * 4 + 3] = vFine[i] * 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
