// Painted feather textures for the birds, generated once.
//
// bodyDetail(): a tiling patch of small contour feathers overlapping like
// roof tiles along the feather flow (+v runs from beak to tail). Channels:
// r = brightness, g/b = offset (uv) from the pixel to the centre of the
// feather covering it, so the plumage shader can colour each feather as a
// whole and colour borders follow real feather edges. Plus a normal map.
//
// featherAtlas(species): one atlas per species with a cell per feather type
// (primary, secondary, tertial, coverts, tail feathers): vane colours, pale
// fringes, bars and spots, the shaft and fine barbs. featherNormal() is the
// matching normal map, shared by every species.
import * as THREE from 'three';
import { noise2 } from '../../shared.js';

const TILE = 256;
const NU = 10; // feathers across a tile
const NV = 8; // rows along a tile
export const DETAIL_OFFSET = 0.25; // offsets are stored as off / range * 0.5 + 0.5

function hash2(i, k) {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function dataTexture(data, w, h, { srgb = false } = {}) {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function normalsFromHeight(hs, w, h, strength, wrap = true) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = wrap ? (x - 1 + w) % w : Math.max(0, x - 1);
      const xr = wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
      const yu = wrap ? (y - 1 + h) % h : Math.max(0, y - 1);
      const yd = wrap ? (y + 1) % h : Math.min(h - 1, y + 1);
      let nx = (hs[y * w + xl] - hs[y * w + xr]) * strength;
      // data textures are not flipped: row 0 is v = 0, so +y is +v
      let ny = (hs[yu * w + x] - hs[yd * w + x]) * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * w + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

// ------------------------------------------------------------ body feathers

let detailCache = null;

export function bodyDetail() {
  if (detailCache) return detailCache;
  const w = TILE;
  const h = TILE;
  const data = new Uint8Array(w * h * 4);
  const hs = new Float32Array(w * h);
  const L = 1.7 / NV; // a feather reaches 1.7 rows back
  const W = 0.66 / NU; // half width, so neighbours overlap a little
  // per-feather jitter so the rows never look like a grid of scales
  const jit = (i, k) => {
    const ii = ((i % NU) + NU) % NU;
    const kk = ((k % NV) + NV) % NV;
    return [(hash2(ii, kk) - 0.5) * 0.45 / NU, (hash2(ii + 31, kk + 17) - 0.5) * 0.35 / NV, 0.85 + 0.3 * hash2(ii + 7, kk + 5)];
  };
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      // the front-most feather covering (u, v): feathers nearer the beak lie on top
      let best = null;
      const k0 = Math.floor(v * NV);
      for (let dk = -2; dk <= 1 && !best; dk++) {
        const k = k0 + dk;
        const shift = (((k % 2) + 2) % 2) * 0.5;
        const i0 = Math.round(u * NU - shift - 0.5);
        for (let di = -1; di <= 1; di++) {
          const i = i0 + di;
          const [ju, jv, js] = jit(i, k);
          const vk = k / NV + jv;
          const dv = v - vk;
          const len = L * js;
          if (dv < 0 || dv > len) continue;
          const t = dv / len;
          const shape = t > 0.4 ? Math.sqrt(Math.max(0, 1 - ((t - 0.4) / 0.6) ** 2)) : 1;
          const cu = (i + 0.5 + shift) / NU + ju;
          const du = u - cu;
          const ww = W * shape * js;
          if (Math.abs(du) < ww) {
            const a = du / (W * js + 1e-6);
            if (!best || Math.abs(a) < Math.abs(best.a)) best = { i, k, t, a, cu, vk, len, shape };
          }
        }
      }
      const idx = y * w + x;
      const hair = noise2(u * 180, v * 22) - 0.5;
      if (!best) {
        hs[idx] = 0;
        data[idx * 4] = 170;
        data[idx * 4 + 1] = 128;
        data[idx * 4 + 2] = 128;
        data[idx * 4 + 3] = 255;
        continue;
      }
      const { i, k, t, a } = best;
      const rnd = hash2((i + 64) & 1023, (k + 64) & 1023);
      // barbs: fine lines fanning back from the shaft
      const barbs = Math.sin((a * 5.5 + (a < 0 ? -1 : 1) * t * 0.8) * Math.PI * 2) * 0.5;
      // how close to this feather's rounded tip edge (for the soft step)
      const edge = Math.min(1, (best.shape - Math.abs(a)) * 3 + (1 - t) * 2.5);
      hs[idx] = 0.3 + t * 0.35 + 0.25 * Math.min(1, edge * 2) + (barbs * 0.04 + hair * 0.1);
      let lum = 0.95 - 0.07 * (1 - THREE.MathUtils.smoothstep(t, 0.0, 0.3));
      lum += 0.03 * (1 - Math.min(1, edge * 4));
      lum += (rnd - 0.5) * 0.05 + barbs * 0.035 + hair * 0.09;
      data[idx * 4] = Math.max(0, Math.min(255, lum * 235));
      // offset to the centre of the feather's exposed part (tile uv units)
      const offU = best.cu - u;
      const offV = best.vk + best.len * 0.7 - v;
      data[idx * 4 + 1] = Math.max(0, Math.min(255, (offU / DETAIL_OFFSET) * 127.5 + 127.5));
      data[idx * 4 + 2] = Math.max(0, Math.min(255, (offV / DETAIL_OFFSET) * 127.5 + 127.5));
      data[idx * 4 + 3] = 255;
    }
  }
  // soften the height a touch so edges read as soft feathers, not tiles
  const soft = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += hs[((y + dy + h) % h) * w + ((x + dx + w) % w)];
      soft[y * w + x] = sum / 9;
    }
  }
  const map = dataTexture(data, w, h);
  const normal = dataTexture(normalsFromHeight(soft, w, h, 1.6), w, h);
  detailCache = { map, normal };
  return detailCache;
}

// ------------------------------------------------------------ wing and tail feathers

export const ATLAS_W = 512;
export const ATLAS_H = 1024;
// [x, y, w, h] in pixels; y from the top of the image
export const CELLS = {
  primary: [0, 0, 64, 1024],
  secondary: [64, 0, 64, 1024],
  tertial: [128, 0, 64, 1024],
  rectrix: [192, 0, 64, 1024],
  outerRect: [256, 0, 64, 1024],
  gcov: [320, 0, 64, 512],
  pcov: [320, 512, 64, 512],
  patch: [384, 0, 128, 512],
  alula: [384, 512, 64, 512],
};

// uv rectangle of a cell: [u0, v0, u1, v1], b = 0 (feather base) at v0
export function cellUV(type) {
  const [x, y, w, h] = CELLS[type];
  // data textures are not flipped: row 0 is v = 0; rows run base to tip
  return [x / ATLAS_W, y / ATLAS_H, (x + w) / ATLAS_W, (y + h) / ATLAS_H];
}

// sRGB components 0..1 of a '#rrggbb' colour (painting happens in sRGB)
const rgbCache = new Map();
function rgb(hex) {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    rgbCache.set(hex, c);
  }
  return c;
}
function mix3(a, b, k) {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
const sm = THREE.MathUtils.smoothstep;

// Colour of a flight or tail feather at (a, b): a in -1..1 across (negative
// is the outer web), b in 0..1 from base to tip. `dims` in millimetres.
function featherColor(f, a, b, dims, px, py) {
  const outer = a < 0;
  const hw = dims.width * 0.5 * (outer ? dims.outer : 1 - dims.outer) * 2;
  const edgeMM = (1 - Math.abs(a)) * hw;
  const tipMM = (1 - b) * dims.len;
  let c = rgb(outer ? f.base : f.inner || f.base);
  if (f.outerEdge && outer) c = mix3(c, rgb(f.outerEdge), sm(Math.abs(a), 0.15, 0.55));
  const web = (w) => !w || w === 'both' || (w === 'outer') === outer;
  if (f.band && web(f.band.web)) {
    const k = sm(b, f.band.b0 - 0.02, f.band.b0 + 0.02) * (1 - sm(b, f.band.b1 - 0.03 + a * 0.03, f.band.b1 + 0.03 + a * 0.03));
    c = mix3(c, rgb(f.band.color), k);
  }
  if (f.spot && web(f.spot.web)) {
    const k = sm(b, f.spot.b0, f.spot.b0 + 0.05) * (1 - sm(b, f.spot.b1 - 0.05, f.spot.b1)) * sm(Math.abs(a), 0.15, 0.3) * (1 - sm(Math.abs(a), 0.8, 0.95));
    c = mix3(c, rgb(f.spot.color), k);
  }
  // pale fringe along the edges and round the tip
  const fr = Math.min(edgeMM, tipMM * 0.8);
  const fk = 1 - sm(fr, f.fringeW * 0.5, f.fringeW * 1.4);
  c = mix3(c, rgb(f.fringe), fk * 0.85 * sm(b, 0.25, 0.45));
  if (f.tip && web(f.tip.web)) {
    const k = sm(b, 1 - f.tip.len * (1 - 0.35 * a * a) - 0.012, 1 - f.tip.len * (1 - 0.35 * a * a) + 0.012);
    c = mix3(c, rgb(f.tip.color), k);
  }
  // fluffy grey down at the base (under the coverts)
  c = mix3(c, mix3(c, [0.45, 0.43, 0.4], 0.5), 1 - sm(b, 0.03, 0.1));
  // the shaft
  const shaftW = (0.22 - 0.14 * b) / Math.max(0.5, hw);
  const sk = 1 - sm(Math.abs(a), shaftW * 0.6, shaftW * 1.3);
  c = mix3(c, rgb(f.shaft || f.base), sk * 0.8);
  // barbs: fine lines slanting from the shaft towards the tip
  const q = b * dims.len * 3.3 - Math.abs(a) * hw * 2.3;
  const barb = Math.sin(q * Math.PI * 2) * 0.5 + 0.5;
  const n = noise2(px * 0.35, py * 0.07) - 0.5;
  const lum = 1 + (barb - 0.5) * 0.06 + n * 0.06 - 0.05 * sm(Math.abs(a), 0.0, 0.5) * (outer ? 0 : 1);
  return [c[0] * lum, c[1] * lum, c[2] * lum];
}

function featherHeight(a, b, dims) {
  const outer = a < 0;
  const hw = dims.width * 0.5 * (outer ? dims.outer : 1 - dims.outer) * 2;
  const q = b * dims.len * 3.3 - Math.abs(a) * hw * 2.3;
  const barb = Math.sin(q * Math.PI * 2) * 0.5 + 0.5;
  const shaft = Math.exp(-Math.pow((a * hw) / 0.28, 2)) * (1 - 0.6 * b);
  return shaft * 0.9 + (1 - a * a) * 0.35 + barb * 0.1;
}

// Small covert feathers in rows, for the patch over the arm.
function patchSample(f, a, b, dims) {
  const rows = f.rows || 3;
  const Wmm = dims.width;
  const along = (a * 0.5 + 0.5) * Wmm;
  const fw = 4.2; // mm, width of one covert
  let best = null;
  const r0 = Math.floor(b * rows);
  for (let r = r0 + 1; r >= Math.max(0, r0 - 1); r--) {
    const tipB = (r + 1) / rows;
    const shift = r % 2 ? fw * 0.5 : 0;
    const i = Math.round((along - shift) / fw);
    for (let di = -1; di <= 1; di++) {
      const cx = (i + di) * fw + shift;
      const dx = (along - cx) / (fw * 0.62);
      const reach = tipB - (1 / rows) * 1.6;
      const lenB = tipB - reach;
      const t = (b - reach) / lenB;
      if (t < 0 || t > 1) continue;
      const shape = t > 0.45 ? Math.sqrt(Math.max(0, 1 - ((t - 0.45) / 0.55) ** 2)) : 1;
      if (Math.abs(dx) < shape) {
        // rows nearer the leading edge (small b) lie on top
        if (!best || r < best.r) best = { r, t, dx, shape };
      }
    }
  }
  return best;
}

function patchColor(f, a, b, dims, px, py) {
  const s = patchSample(f, a, b, dims);
  let c = rgb(f.base);
  if (!s) return mix3(c, [0.3, 0.28, 0.26], 0.4);
  const edge = Math.min(1 - Math.abs(s.dx) / s.shape, (1 - s.t) * 3);
  c = mix3(c, rgb(f.fringe), (1 - sm(edge, 0.05, 0.3)) * 0.6);
  const n = noise2(px * 0.3, py * 0.3) - 0.5;
  const lum = 0.9 + 0.12 * sm(s.t, 0.1, 0.6) + n * 0.06;
  return [c[0] * lum, c[1] * lum, c[2] * lum];
}

function patchHeight(f, a, b, dims) {
  const s = patchSample(f, a, b, dims);
  if (!s) return 0;
  return 0.2 + s.t * 0.6 + (1 - s.dx * s.dx) * 0.2;
}

// dims: { type: { len, width, outer } } in millimetres, from the wing layout
export function featherAtlas(sp, dims) {
  const w = ATLAS_W;
  const h = ATLAS_H;
  const data = new Uint8Array(w * h * 4);
  data.fill(0);
  for (const type of Object.keys(CELLS)) {
    const [x0, y0, cw, ch] = CELLS[type];
    const f = sp.feathers[type];
    const d = dims[type];
    if (!f || !d) continue;
    for (let y = y0; y < y0 + ch; y++) {
      const b = (y - y0 + 0.5) / ch;
      for (let x = x0; x < x0 + cw; x++) {
        const a = ((x - x0 + 0.5) / cw) * 2 - 1;
        const c = type === 'patch' ? patchColor(f, a, b, d, x, y) : featherColor(f, a, b, d, x, y);
        const i = (y * w + x) * 4;
        data[i] = Math.max(0, Math.min(255, c[0] * 255));
        data[i + 1] = Math.max(0, Math.min(255, c[1] * 255));
        data[i + 2] = Math.max(0, Math.min(255, c[2] * 255));
        data[i + 3] = 255;
      }
    }
  }
  const tex = dataTexture(data, w, h, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

let normalCache = null;

export function featherNormal(dims) {
  if (normalCache) return normalCache;
  const w = ATLAS_W;
  const h = ATLAS_H;
  const hs = new Float32Array(w * h);
  for (const type of Object.keys(CELLS)) {
    const [x0, y0, cw, ch] = CELLS[type];
    const d = dims[type];
    if (!d) continue;
    for (let y = y0; y < y0 + ch; y++) {
      const b = (y - y0 + 0.5) / ch;
      for (let x = x0; x < x0 + cw; x++) {
        const a = ((x - x0 + 0.5) / cw) * 2 - 1;
        hs[y * w + x] = type === 'patch' ? patchHeight({ rows: 3 }, a, b, d) : featherHeight(a, b, d);
      }
    }
  }
  const tex = dataTexture(normalsFromHeight(hs, w, h, 1.6, false), w, h);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  normalCache = tex;
  return tex;
}

