// Procedural, tileable noise textures generated at start-up. Nothing here is
// loaded from disk: every texture in the game is made in code.
import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable gradient noise sampled on a size x size grid with the given period.
function gradientNoise(size, period, rand) {
  const grads = new Float32Array(period * period * 2);
  for (let i = 0; i < period * period; i++) {
    const a = rand() * Math.PI * 2;
    grads[i * 2] = Math.cos(a);
    grads[i * 2 + 1] = Math.sin(a);
  }
  const out = new Float32Array(size * size);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      let v = 0;
      const dot = (ix, iy, dx, dy) => {
        const gi = ((iy % period) * period + (ix % period)) * 2;
        return grads[gi] * dx + grads[gi + 1] * dy;
      };
      const n00 = dot(x0, y0, tx, ty);
      const n10 = dot(x0 + 1, y0, tx - 1, ty);
      const n01 = dot(x0, y0 + 1, tx, ty - 1);
      const n11 = dot(x0 + 1, y0 + 1, tx - 1, ty - 1);
      const u = fade(tx);
      const w = fade(ty);
      v = (n00 * (1 - u) + n10 * u) * (1 - w) + (n01 * (1 - u) + n11 * u) * w;
      out[y * size + x] = v * 0.7071 + 0.5;
    }
  }
  return out;
}

// Tileable inverted Worley (cellular) noise: puffy, billowy shapes.
function worleyNoise(size, cells, rand) {
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 2] = rand();
    pts[i * 2 + 1] = rand();
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      let best = 9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const ix = (cx + ox + cells) % cells;
          const iy = (cy + oy + cells) % cells;
          const px = cx + ox + pts[(iy * cells + ix) * 2];
          const py = cy + oy + pts[(iy * cells + ix) * 2 + 1];
          const d = (px - fx) ** 2 + (py - fy) ** 2;
          if (d < best) best = d;
        }
      }
      out[y * size + x] = 1 - Math.min(1, Math.sqrt(best));
    }
  }
  return out;
}

function fbm(size, basePeriod, octaves, rand) {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = gradientNoise(size, basePeriod << o, rand);
    for (let i = 0; i < out.length; i++) out[i] += (n[i] - 0.5) * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i] / total + 0.5;
  return out;
}

function normalise(arr) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of arr) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const r = hi - lo || 1;
  for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] - lo) / r;
  return arr;
}

function toTexture(size, channels) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 4; c++) {
      const src = channels[c];
      data[i * 4 + c] = src ? Math.max(0, Math.min(255, Math.round(src[i] * 255))) : 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// RGBA noise used by the sky, the mist and the particles:
// r = soft fbm, g = billowy worley-fbm, b = fine fbm, a = fine worley.
export function createCloudNoise(size = 256) {
  const rand = mulberry32(1337);
  const r = normalise(fbm(size, 4, 5, rand));
  const w1 = worleyNoise(size, 6, rand);
  const w2 = worleyNoise(size, 12, rand);
  const g = normalise(w1.map((v, i) => v * 0.65 + w2[i] * 0.35));
  const b = normalise(fbm(size, 8, 4, rand));
  const a = normalise(worleyNoise(size, 20, rand));
  return toTexture(size, [r, g, b, a]);
}

// Tangent-space normal map for wind ripples on the sea, derived from a
// tileable height field. Stored as RG slopes (0.5 = flat).
export function createWaveNormals(size = 256) {
  const rand = mulberry32(99);
  const h = normalise(fbm(size, 4, 5, rand));
  const nx = new Float32Array(size * size);
  const nz = new Float32Array(size * size);
  const hs = new Float32Array(size * size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 6;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 6;
      nx[y * size + x] = Math.max(0, Math.min(1, dx * 0.5 + 0.5));
      nz[y * size + x] = Math.max(0, Math.min(1, dy * 0.5 + 0.5));
      hs[y * size + x] = h[y * size + x];
    }
  }
  return toTexture(size, [nx, nz, hs, null]);
}

// Ripstop nylon: a fine square reinforcement grid over a plain weave.
export function createRipstopNormal(size = 128) {
  const data = new Uint8Array(size * size * 4);
  const cell = 16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x % cell;
      const gy = y % cell;
      let dx = 0;
      let dy = 0;
      if (gx === 0) dx = 0.55;
      if (gx === 1) dx = -0.55;
      if (gy === 0) dy = 0.55;
      if (gy === 1) dy = -0.55;
      // plain weave: alternating over/under threads
      const weave = ((x >> 1) + (y >> 1)) & 1 ? 0.12 : -0.12;
      dx += weave;
      dy -= weave;
      const i = (y * size + x) * 4;
      const len = Math.hypot(dx, dy, 1);
      data[i] = Math.round((dx / len * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
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

// Woven wicker for the baskets: colour in RGB, height-ish shading baked in.
export function createWickerTexture(size = 128) {
  const rand = mulberry32(7);
  const data = new Uint8Array(size * size * 4);
  const band = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / band);
      const col = Math.floor(x / band);
      const over = (row + col) & 1;
      const ty = (y % band) / band;
      const tx = (x % band) / band;
      // horizontal weavers bulge, vertical stakes show where they pass over
      const bulge = over ? Math.sin(ty * Math.PI) : Math.sin(tx * Math.PI) * 0.8;
      const grain = 0.85 + rand() * 0.15;
      const shade = (0.45 + bulge * 0.55) * grain;
      const i = (y * size + x) * 4;
      data[i] = Math.round(150 * shade);
      data[i + 1] = Math.round(104 * shade);
      data[i + 2] = Math.round(62 * shade);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export { mulberry32 };
