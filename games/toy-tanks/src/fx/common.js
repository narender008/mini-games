// Shared bits for the explosion effects: palettes, random helpers, the small
// procedural textures (a tileable noise and the ground-splat atlas) and the
// GLSL used by more than one material.
//
// Everything here is made once at start-up. Nothing in the per-frame paths
// allocates: the random helpers return numbers, palettes are flat typed arrays
// and colours are copied out by index.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const rnd = Math.random;
export const rr = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// A palette is a Float32Array of linear r,g,b triples (the hex codes are sRGB,
// as artists write them, and THREE converts them).
const _c = new THREE.Color();
export function palette(hexes) {
  const a = new Float32Array(hexes.length * 3);
  for (let i = 0; i < hexes.length; i++) {
    _c.set(hexes[i]);
    a[i * 3] = _c.r;
    a[i * 3 + 1] = _c.g;
    a[i * 3 + 2] = _c.b;
  }
  return a;
}
export const paletteSize = (p) => (p.length / 3) | 0;

// Natural colours. Nothing here is a candy or neon colour: paper is soft and a
// little chalky, glitter is metal, gel is dessert jelly, mud is wet earth.
export const PAPER = palette(['#e4605f', '#f1b447', '#f3d76e', '#63b884', '#5aa9cc', '#8c88cb', '#e58fae', '#f3ead8', '#ee8b50', '#a8cf77']);
// craft glitter: mostly gold and silver, a few tinted metals
export const GLITTER = palette(['#f0c766', '#f0c766', '#e9b957', '#f3dc9a', '#eef1f4', '#d9a25a', '#9fc0d8', '#c9b0e0']);
// dessert-jelly hues, one is chosen per burst
export const GEL = palette(['#e23f5b', '#f4992a', '#59c168', '#3f9fe0', '#a55fcb', '#f3c62b']);
export const MUD = palette(['#5b4029', '#6a4a2f', '#7a5a3a', '#4f3826']);
// muddy puddle water, light where it is thin
export const WATER_TONES = palette(['#a3957c', '#8f836f', '#b3a68d']);
// rubber granules
export const BEADS = palette(['#e86f7f', '#f0b04a', '#58b7c4', '#8fc46a', '#7f8fd6']);
// the coloured powder a ball is filled with, as natural pigment
export const PIGMENT = { confetti: palette(['#d3a679']), star: palette(['#d8c9a2']), triple: palette(['#a394c4']), bouncy: palette(['#d68d99']), jelly: palette(['#d9aab4']) };
export const WHITE = palette(['#ffffff']);

export function setRgb(out, o, pal, i) {
  out[o] = pal[i * 3];
  out[o + 1] = pal[i * 3 + 1];
  out[o + 2] = pal[i * 3 + 2];
}
export function randomColorIndex(pal) {
  return (Math.random() * (pal.length / 3)) | 0;
}

// What the ground throws up, per ground kind. dust: the colour of the cloud;
// soil: grains and crumbs; bit: leaves and blades; wet: how glossy the clumps
// are (0 dry .. 1 wet); dustAmt: how dense the dust is.
const g = (hex) => palette([hex]);
export const GROUND_KIT = {
  grass: { dust: g('#9c9580'), soil: palette(['#6a4c31', '#7a5a3a', '#5a4029', '#846540']), bit: palette(['#4d8a2c', '#6aa040', '#3b7526', '#86b04c']), wet: 0.05, dustAmt: 0.34, splatTint: g('#5a3a20') },
  sand: { dust: g('#d9cfb2'), soil: palette(['#dcc28c', '#cdb078', '#e8d4a2', '#c2a468']), bit: palette(['#e6d3a6']), wet: 0.0, dustAmt: 0.5, splatTint: g('#c9a15e') },
  mud: { dust: g('#85735c'), soil: MUD, bit: palette(['#6a4a2f']), wet: 0.85, dustAmt: 0.24, splatTint: g('#3a2214') },
  snow: { dust: g('#ffffff'), soil: palette(['#ffffff', '#f4f8ff', '#eaf1ff']), bit: palette(['#ffffff']), wet: 0.0, dustAmt: 0.8, splatTint: g('#e8f0ff') },
  moss: { dust: g('#857f62'), soil: palette(['#5a4429', '#6b4f2c', '#4a3a22', '#5c4a28']), bit: palette(['#4a7d30', '#35642a', '#5f8a34', '#7c6a30']), wet: 0.1, dustAmt: 0.3, splatTint: g('#4a3018') },
};

// ---------------------------------------------------------------------------
// Noise texture: R = height, G/B = its gradient (0.5 = flat), A = a second,
// unrelated noise. Tileable value noise with a few octaves. Used to give the
// powder clouds their billows and the clumps their grain.
function hash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 144665)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function tileNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct, base, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * tileNoise(x * f, y * f, base * f, seed + i * 31);
    norm += amp;
    amp *= 0.55;
    f *= 2;
  }
  return sum / norm;
}

export function makeNoiseTexture(size = 256) {
  const h = new Float32Array(size * size);
  const h2 = new Float32Array(size * size);
  const base = 6;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = (i / size) * base;
      const v = (j / size) * base;
      h[j * size + i] = fbm(u, v, 5, base, 7);
      h2[j * size + i] = fbm(u, v, 4, base, 91);
    }
  }
  // stretch the height to use the full range, so thresholds behave the same everywhere
  let lo = 1;
  let hi = 0;
  for (let i = 0; i < h.length; i++) {
    if (h[i] < lo) lo = h[i];
    if (h[i] > hi) hi = h[i];
  }
  // gradient from a softened copy of the height, so the shading shows billows, not grit
  const hs = new Float32Array(h);
  const tmp = new Float32Array(h.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) tmp[j * size + i] = (hs[j * size + ((i + size - 2) % size)] + hs[j * size + ((i + size - 1) % size)] + hs[j * size + i] + hs[j * size + ((i + 1) % size)] + hs[j * size + ((i + 2) % size)]) / 5;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) hs[j * size + i] = (tmp[((j + size - 2) % size) * size + i] + tmp[((j + size - 1) % size) * size + i] + tmp[j * size + i] + tmp[((j + 1) % size) * size + i] + tmp[((j + 2) % size) * size + i]) / 5;
  }
  const data = new Uint8Array(size * size * 4);
  const at = (i, j) => hs[((j + size) % size) * size + ((i + size) % size)];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const v = (h[k] - lo) / (hi - lo);
      const gx = (at(i + 1, j) - at(i - 1, j)) / (hi - lo);
      const gy = (at(i, j + 1) - at(i, j - 1)) / (hi - lo);
      data[k * 4] = clamp(v, 0, 1) * 255;
      data[k * 4 + 1] = clamp(0.5 + gx * 18, 0, 1) * 255;
      data[k * 4 + 2] = clamp(0.5 + gy * 18, 0, 1) * 255;
      data[k * 4 + 3] = clamp(h2[k], 0, 1) * 255;
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

// ---------------------------------------------------------------------------
// Splat atlas for the ground stains: 4 x 3 cells of 256 px. Each cell is an
// organic splat (a wobbly body, thin tendrils that end in round droplets,
// satellite drops). R = thickness (a blurred version of the shape, used as a
// bump so the paint looks wet and raised), A = coverage.
export const SPLAT_CELLS = 12;
export function makeSplatAtlas() {
  const cell = 256;
  const cols = 4;
  const rows = 3;
  const W = cell * cols;
  const H = cell * rows;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  let seed = 12345;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const blob = (cx, cy, R, lobes, spikes, spikeLen, spikeW) => {
    const ph1 = rand() * TAU;
    const ph2 = rand() * TAU;
    const ph3 = rand() * TAU;
    const angles = [];
    for (let s = 0; s < spikes; s++) angles.push((s + rand() * 0.7) / spikes * TAU);
    const N = 220;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      let r = R * (1 + lobes * (0.5 * Math.sin(3 * a + ph1) + 0.35 * Math.sin(5 * a + ph2) + 0.25 * Math.sin(9 * a + ph3)));
      for (let s = 0; s < spikes; s++) {
        let d = Math.abs(a - angles[s]);
        d = Math.min(d, TAU - d);
        r += R * spikeLen * (0.55 + 0.45 * ((s * 7) % 5) / 4) * Math.exp(-(d * d) / (spikeW * spikeW));
      }
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    return angles;
  };
  const dot = (x, y, r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };
  for (let c = 0; c < SPLAT_CELLS; c++) {
    const ox = (c % cols) * cell;
    const oy = Math.floor(c / cols) * cell;
    const cx = ox + cell / 2;
    const cy = oy + cell / 2;
    const R = cell * 0.17;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, cell, cell);
    ctx.clip();
    if (c < 4) {
      // round splats with tendrils ending in drops
      const spikes = 7 + c * 2;
      const angles = blob(cx, cy, R, 0.14 + c * 0.03, spikes, 0.75 + 0.15 * c, 0.09 + 0.02 * (3 - c));
      for (let s = 0; s < spikes; s++) {
        const a = angles[s];
        const len = R * (1.35 + rand() * 0.8);
        const w = R * (0.05 + rand() * 0.05);
        // a thin neck to a round drop
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 0.9 - Math.sin(a) * w, cy + Math.sin(a) * R * 0.9 + Math.cos(a) * w);
        ctx.lineTo(cx + Math.cos(a) * len + Math.sin(a) * 0, cy + Math.sin(a) * len);
        ctx.lineTo(cx + Math.cos(a) * R * 0.9 + Math.sin(a) * w, cy + Math.sin(a) * R * 0.9 - Math.cos(a) * w);
        ctx.fill();
        dot(cx + Math.cos(a) * (len + R * 0.12), cy + Math.sin(a) * (len + R * 0.12), R * (0.1 + rand() * 0.14));
      }
      const sat = 14 + c * 4;
      for (let s = 0; s < sat; s++) {
        const a = rand() * TAU;
        const d = R * (1.7 + rand() * 1.05);
        dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.03 + rand() * 0.07));
      }
    } else if (c >= 8) {
      // soft stains and dustings, no hard edge: overlapping radial gradients
      const soft = (x, y, r, a) => {
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        gr.addColorStop(0.55, 'rgba(255,255,255,' + a * 0.55 + ')');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      };
      if (c < 11) {
        const lobes = 9 + (c - 8) * 3;
        for (let s = 0; s < lobes; s++) {
          const a = rand() * TAU;
          const d = R * (0.1 + rand() * 1.15);
          soft(cx + Math.cos(a) * d, cy + Math.sin(a) * d * (0.75 + 0.3 * rand()), R * (0.5 + rand() * 0.6), 0.5 + rand() * 0.3);
        }
        soft(cx, cy, R * 1.3, 0.7);
      } else {
        // fine powder thrown over the ground: many tiny grains, thinning outwards
        for (let s = 0; s < 900; s++) {
          const a = rand() * TAU;
          const d = R * 2.8 * Math.pow(rand(), 0.75);
          const fall = 1 - d / (R * 2.9);
          ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.6 * rand()) * Math.min(1, fall * 1.6) + ')';
          dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.8 + rand() * 2.2);
        }
        soft(cx, cy, R * 1.5, 0.45);
      }
    } else {
      // elongated splats thrown in one direction, with a spray of drops
      const dir = (c - 4) * 0.4 + 0.2;
      ctx.translate(cx, cy);
      ctx.rotate(dir);
      ctx.translate(-cx, -cy);
      blob(cx - R * 1.0, cy, R * 0.95, 0.12, 5, 0.5, 0.12);
      ctx.beginPath();
      ctx.ellipse(cx - R * 0.2, cy, R * 1.4, R * 0.5, 0, 0, TAU);
      ctx.fill();
      for (let s = 0; s < 9; s++) {
        const x = cx + R * (0.8 + rand() * 1.65);
        const y = cy + (rand() - 0.5) * R * (0.6 + s * 0.28);
        dot(x, y, R * (0.06 + rand() * 0.16) * (1.4 - s * 0.08));
      }
      for (let s = 0; s < 12; s++) dot(cx + R * (rand() * 2.9 - 1.0), cy + (rand() - 0.5) * R * 2.6, R * (0.03 + rand() * 0.05));
    }
    ctx.restore();
  }
  const img = ctx.getImageData(0, 0, W, H).data;
  const cover = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) cover[i] = img[i * 4 + 3] / 255;
  // thickness: a few box blurs of the coverage, per cell so cells do not bleed
  const height = new Float32Array(W * H);
  const tmp = new Float32Array(cell * cell);
  const tmp2 = new Float32Array(cell * cell);
  const rad = 7;
  for (let c = 0; c < SPLAT_CELLS; c++) {
    const ox = (c % cols) * cell;
    const oy = Math.floor(c / cols) * cell;
    for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) tmp[j * cell + i] = cover[(oy + j) * W + ox + i];
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < cell; j++) {
        let acc = 0;
        for (let i = -rad; i <= rad; i++) acc += tmp[j * cell + Math.min(cell - 1, Math.max(0, i))];
        for (let i = 0; i < cell; i++) {
          tmp2[j * cell + i] = acc / (2 * rad + 1);
          acc += tmp[j * cell + Math.min(cell - 1, i + rad + 1)] - tmp[j * cell + Math.max(0, i - rad)];
        }
      }
      for (let i = 0; i < cell; i++) {
        let acc = 0;
        for (let j = -rad; j <= rad; j++) acc += tmp2[Math.min(cell - 1, Math.max(0, j)) * cell + i];
        for (let j = 0; j < cell; j++) {
          tmp[j * cell + i] = acc / (2 * rad + 1);
          acc += tmp2[Math.min(cell - 1, j + rad + 1) * cell + i] - tmp2[Math.max(0, j - rad) * cell + i];
        }
      }
    }
    for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) height[(oy + j) * W + ox + i] = tmp[j * cell + i];
  }
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // flip vertically so uv (0,0) is the bottom-left of the atlas as drawn
      const src = (H - 1 - y) * W + x;
      const k = (y * W + x) * 4;
      // the soft stains (cells 8+) are flat: no bump
      const sc = Math.floor((H - 1 - y) / cell) * cols + Math.floor(x / cell);
      data[k] = (sc >= 8 ? 0.42 : clamp(height[src] * 1.3, 0, 1)) * 255;
      data[k + 1] = 0;
      data[k + 2] = 0;
      data[k + 3] = cover[src] * 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.userData.cols = cols;
  tex.userData.rows = rows;
  return tex;
}

// GLSL shared by the lit instanced materials: a bump from a height sampled by
// the caller, using screen-space derivatives (the same maths as three's bump map).
export const PERTURB_GLSL = /* glsl */ `
vec3 ttPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surfPos));
  vec3 vSigmaY = normalize(dFdy(surfPos));
  vec3 R1 = cross(vSigmaY, surfNorm);
  vec3 R2 = cross(surfNorm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surfNorm - vGrad);
}`;
