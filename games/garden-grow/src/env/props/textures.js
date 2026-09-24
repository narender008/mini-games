// Painted textures for the garden props, drawn once in code and shared by
// every garden style: weathered timber (long grain and end grain), white
// paint worn back to the grain, terracotta with mineral bloom, sandstone,
// leaf clusters, a clipped hedge, bark, brick and wicker. Each builder returns
// { map, normalMap } (colour maps sRGB, normal maps linear).
import * as THREE from 'three';

// ---------------------------------------------------------------- noise

function ih(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Value noise that wraps every `px` lattice cells in x and `py` in y (0 means
// no wrap), so textures tile without a seam.
function pn(x, y, px, py, s) {
  let x0 = Math.floor(x);
  let y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  let x1 = x0 + 1;
  let y1 = y0 + 1;
  if (px) {
    x0 = ((x0 % px) + px) % px;
    x1 = (x0 + 1) % px;
  }
  if (py) {
    y0 = ((y0 % py) + py) % py;
    y1 = (y0 + 1) % py;
  }
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = ih(x0, y0, s);
  const b = ih(x1, y0, s);
  const c = ih(x0, y1, s);
  const d = ih(x1, y1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// Fractal noise in 0..1 built from pn (periods double with each octave).
function pf(x, y, px, py, oct, s) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * pn(x * f, y * f, px * f, py * f, s + i * 31);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// A smooth noise layer sampled once on a coarse grid over u, a in 0..1 (u
// wraps) and read back bilinearly: the low-frequency layers do not need
// evaluating at every pixel, and painting is the slow part of a first build.
const fields = new Map();
function field(key, nu, na, fn) {
  let f = fields.get(key);
  if (!f) {
    const g = new Float32Array((nu + 1) * (na + 1));
    for (let j = 0; j <= na; j++) for (let i = 0; i <= nu; i++) g[j * (nu + 1) + i] = fn(i / nu, j / na);
    f = (u, a) => {
      const x = (u - Math.floor(u)) * nu;
      const y = Math.min(na - 1e-6, Math.max(0, a * na));
      const i = Math.floor(x);
      const j = Math.floor(y);
      const tx = x - i;
      const ty = y - j;
      const o = j * (nu + 1) + i;
      const p = g[o] + (g[o + 1] - g[o]) * tx;
      const q = g[o + nu + 1] + (g[o + nu + 2] - g[o + nu + 1]) * tx;
      return p + (q - p) * ty;
    };
    fields.set(key, f);
  }
  return f;
}

const sm = (a, b, v) => {
  const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const mix = (a, b, k) => a + (b - a) * k;

// ---------------------------------------------------------------- canvas plumbing

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, srgb, { repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Builds a colour texture and a normal map from a per-pixel painter.
// paint(x, y, out) writes out[0..2] (sRGB 0..255), out[3] alpha (0..255)
// and returns the height (any scale; `strength` sets the relief).
function build(w, h, paint, { strength = 2, wrapX = true, wrapY = true, alpha = false } = {}) {
  const colour = canvasOf(w, h);
  const cx = colour.getContext('2d');
  const img = cx.createImageData(w, h);
  const hs = new Float32Array(w * h);
  const out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[3] = 255;
      hs[y * w + x] = paint(x, y, out);
      const o = (y * w + x) * 4;
      img.data[o] = out[0];
      img.data[o + 1] = out[1];
      img.data[o + 2] = out[2];
      img.data[o + 3] = alpha ? out[3] : 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return { map: toTexture(colour, true), normalMap: normalsFrom(hs, w, h, strength, wrapX, wrapY) };
}

function normalsFrom(hs, w, h, strength, wrapX = true, wrapY = true) {
  const c = canvasOf(w, h);
  const cx = c.getContext('2d');
  const img = cx.createImageData(w, h);
  const at = (x, y) => {
    x = wrapX ? (x + w) % w : Math.min(w - 1, Math.max(0, x));
    y = wrapY ? (y + h) % h : Math.min(h - 1, Math.max(0, y));
    return hs[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      // canvas rows run down while texture v runs up, hence +dy
      img.data[o] = (-dx / l) * 127.5 + 127.5;
      img.data[o + 1] = (dy / l) * 127.5 + 127.5;
      img.data[o + 2] = (1 / l) * 127.5 + 127.5;
      img.data[o + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return toTexture(c, false);
}

// ---------------------------------------------------------------- timber

// Weathered softwood seen along the grain. u (0..1) runs 1.2 m along the
// grain, a (0..1) 0.4 m across it. Writes a neutral silvered colour (tinted
// by each material) and returns the height: latewood stands proud of the
// softer earlywood once the weather has worn it, checks are deep.
const KNOTS = [
  [0.22, 0.3, 0.007],
  [0.71, 0.72, 0.005],
];
const grainFields = [];
function grainFieldsFor(seed) {
  return (grainFields[seed] ||= {
    warp: field(`warp${seed}`, 64, 96, (x, y) => pf(x * 3, y * 3, 3, 0, 3, 11 + seed)),
    silver: field(`silver${seed}`, 64, 64, (x, y) => pf(x * 5, y * 6, 5, 0, 3, 19 + seed)),
    crack: field(`crack${seed}`, 32, 48, (x, y) => pn(x * 4, y * 7, 4, 0, 23 + seed)),
    tone: field(`tone${seed}`, 16, 16, (x, y) => pf(x * 2, y * 2.5, 2, 0, 2, 37 + seed)),
  });
}
function grainAt(u, a, out, seed = 0) {
  const F = grainFields[seed] || grainFieldsFor(seed);
  const am = a * 0.4;
  let d = am * 190 + 3.2 * F.warp(u, a) + 0.8 * pn(u * 14, a * 22, 14, 0, 13 + seed);
  let knot = 0;
  for (const [ku, ka, kr] of KNOTS) {
    let du = u - ku;
    du -= Math.round(du);
    const dx = du * 1.2;
    const dy = am - ka * 0.4;
    const r2 = (dx * dx) / (kr * kr * 5) + (dy * dy) / (kr * kr);
    d += 4 * Math.exp(-r2 * 0.25);
    knot = Math.max(knot, sm(1.3, 0.6, Math.sqrt((dx * dx) / (kr * kr * 1.6) + (dy * dy) / (kr * kr))));
  }
  const ring = d - Math.floor(d);
  const late = sm(0.6, 0.86, ring) * (1 - sm(0.9, 1, ring));
  const fibre = pn(u * 64, a * 560, 64, 0, 17 + seed);
  const silver = F.silver(u, a);
  const crackMask = sm(0.58, 0.72, F.crack(u, a));
  const crack = crackMask * (1 - sm(0.004, 0.02, Math.abs(pn(u * 6, a * 60, 6, 0, 29 + seed) - 0.5)));
  const tone = 0.9 + 0.2 * F.tone(u, a);
  let r = mix(206, 166, late) * tone;
  let g = mix(193, 150, late) * tone;
  let b = mix(174, 132, late) * tone;
  // silvering: the sun bleaches the surface grey in patches
  const s = sm(0.35, 0.7, silver) * 0.55;
  r = mix(r, 190, s);
  g = mix(g, 188, s);
  b = mix(b, 182, s);
  const f = 0.93 + 0.12 * fibre;
  r *= f;
  g *= f;
  b *= f;
  const kn = knot * 0.75;
  r = mix(r, 92, kn);
  g = mix(g, 70, kn);
  b = mix(b, 52, kn);
  r = mix(r, 78, crack * 0.7);
  g = mix(g, 68, crack * 0.7);
  b = mix(b, 58, crack * 0.7);
  out[0] = r;
  out[1] = g;
  out[2] = b;
  return late * 0.55 + fibre * 0.22 - crack * 1.4 + knot * 0.3;
}

// End grain of a sawn log, 0.3 m square with the pith in the middle: rings,
// a few radial drying checks, darker than the long grain.
function endGrainAt(x, y, out, seed) {
  const dx = (x - 0.5) * 0.3;
  const dy = (y - 0.5) * 0.3;
  const r = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const wob = 0.006 * pn(Math.cos(ang) * 3 + 5, Math.sin(ang) * 3 + 5, 0, 0, seed) + 0.003 * pn(ang * 2 + 9, r * 20, 0, 0, seed + 3);
  const d = (r + wob) * 150;
  const ring = d - Math.floor(d);
  const late = sm(0.62, 0.88, ring) * (1 - sm(0.9, 1, ring));
  let check = 0;
  for (let k = 0; k < 4; k++) {
    const ca = ih(k, seed, 7) * Math.PI * 2;
    let da = ang - ca;
    da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
    const len = 0.03 + ih(k, seed, 9) * 0.07;
    check = Math.max(check, (1 - sm(0.0008, 0.003, Math.abs(da) * r)) * sm(len, len * 0.6, r) * sm(0.004, 0.012, r));
  }
  const n = pn(x * 90, y * 90, 0, 0, seed + 5);
  const t = 0.85 + 0.25 * pf(x * 6, y * 6, 0, 0, 3, seed + 7);
  out[0] = mix(178, 128, late) * t * (0.94 + 0.1 * n);
  out[1] = mix(160, 110, late) * t * (0.94 + 0.1 * n);
  out[2] = mix(136, 90, late) * t * (0.94 + 0.1 * n);
  out[0] = mix(out[0], 60, check * 0.75);
  out[1] = mix(out[1], 52, check * 0.75);
  out[2] = mix(out[2], 44, check * 0.75);
  return late * 0.5 + n * 0.25 - check * 1.2;
}

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// 256 x 1024: long grain in the top three quarters (tiles along u), one
// end-grain tile along the bottom. See GRAIN in geom.js.
export function woodTextures() {
  return cached('wood', () => {
    const W = 256;
    const H = 1024;
    const LG = 768;
    return build(
      W,
      H,
      (x, y, out) => {
        if (y < LG) return grainAt(x / W, 1 - y / LG, out);
        return endGrainAt(x / W, 1 - (y - LG) / (H - LG), out, 41);
      },
      { strength: 2.2, wrapY: false },
    );
  });
}

// White paint on the same timber, worn back to the grain: long flakes that
// follow the grain, fine crazing, paint edges lifting. 256 x 512 covering
// 1.2 m along the grain by 0.3 m across; tiles along u.
export function paintedTextures() {
  return cached('paint', () => {
    const W = 256;
    const H = 512;
    const wood = [0, 0, 0];
    const fDirt = field('paintDirt', 32, 32, (x, y) => pf(x * 3, y * 2, 3, 0, 3, 59));
    return build(
      W,
      H,
      (x, y, out) => {
        const u = x / W;
        const a = 1 - y / H;
        const wh = grainAt(u, a * 0.75, wood, 3);
        const m = pf(u * 7, a * 11, 7, 0, 4, 51) * 0.72 + pn(u * 28, a * 34, 28, 0, 53) * 0.28;
        const thr = 0.655;
        const bare = sm(thr, thr + 0.008, m);
        const lip = sm(thr - 0.018, thr, m) * (1 - bare);
        const craze = sm(0.4, 0.6, m) * (1 - sm(0.004, 0.018, Math.abs(pn(u * 36, a * 150, 36, 0, 57) - 0.5))) * (1 - bare);
        const dirt = fDirt(u, a);
        const late = Math.max(0, wh);
        let r = 230 - 22 * dirt - 8 * late;
        let g = 228 - 23 * dirt - 9 * late;
        let b = 219 - 27 * dirt - 10 * late;
        r = mix(r, 176, craze * 0.3);
        g = mix(g, 170, craze * 0.3);
        b = mix(b, 158, craze * 0.3);
        r = mix(r, 244, lip * 0.5);
        g = mix(g, 242, lip * 0.5);
        b = mix(b, 236, lip * 0.5);
        // bare wood shows through, bleached silver-grey
        const grey = (wood[0] + wood[1] + wood[2]) / 3;
        out[0] = mix(r, mix(grey, wood[0], 0.3) * 0.88, bare);
        out[1] = mix(g, mix(grey, wood[1], 0.3) * 0.88, bare);
        out[2] = mix(b, mix(grey, wood[2], 0.3) * 0.86, bare);
        return (1 - bare) * 0.7 + lip * 0.35 + wh * mix(0.3, 1, bare) - craze * 0.3;
      },
      { strength: 1.6 },
    );
  });
}

// ---------------------------------------------------------------- terracotta

// Terracotta for lathe-turned pots: u around the pot (tiles), v = height up
// the pot (0 base, 1 rim). Warm fired clay with flashing, grog specks,
// throwing rings, chalky mineral bloom and green algae round the foot.
export function terracottaTextures() {
  return cached('terracotta', () => {
    const W = 512;
    const H = 256;
    const fWarm = field('tcWarm', 128, 64, (x, y) => pf(x * 4, y * 2, 4, 0, 4, 61));
    const fFlash = field('tcFlash', 32, 16, (x, y) => pf(x * 2, y * 1.5, 2, 0, 3, 63));
    const fCloud = field('tcCloud', 256, 128, (x, y) => pf(x * 5, y * 3.5, 5, 0, 5, 73));
    const fDamp = field('tcDamp', 48, 32, (x, y) => pf(x * 3, y * 2.5, 3, 0, 3, 77));
    return build(
      W,
      H,
      (x, y, out) => {
        const u = x / W;
        const v = 1 - y / H;
        const warm = fWarm(u, v);
        const flash = sm(0.55, 0.8, fFlash(u, v));
        let r = mix(170, 206, warm);
        let g = mix(94, 124, warm);
        let b = mix(68, 90, warm);
        r = mix(r, 142, flash * 0.35);
        g = mix(g, 84, flash * 0.35);
        b = mix(b, 62, flash * 0.35);
        const speck = ih(x, y, 67);
        if (speck > 0.988) {
          r *= 0.78;
          g *= 0.76;
          b *= 0.76;
        } else if (speck < 0.01) {
          r = mix(r, 226, 0.35);
          g = mix(g, 176, 0.35);
          b = mix(b, 140, 0.35);
        }
        const fine = pn(u * 200, v * 100, 200, 0, 69);
        r *= 0.96 + 0.06 * fine;
        g *= 0.96 + 0.06 * fine;
        b *= 0.96 + 0.06 * fine;
        // efflorescence: salts wicked out of the clay and dried to a chalky
        // bloom, heaviest low down and just under the rim, in soft clouds and
        // a few runs down from the rim
        const band = 0.45 + 0.55 * sm(0.55, 0.05, v) + 0.4 * sm(0.7, 0.84, v) * (1 - sm(0.9, 0.97, v));
        const drip = sm(0.6, 0.92, pn(u * 30, v * 1.4, 30, 0, 71)) * sm(0.3, 0.9, v);
        const cloud = fCloud(u, v);
        // a chalky crust, mottled rather than painted on
        const crust = 0.55 + 0.45 * pn(u * 90, v * 45, 90, 0, 75);
        const bloom = Math.min(0.85, sm(0.3, 0.78, cloud * band + drip * 0.25) * 0.75 * crust + 0.06);
        r = mix(r, 206, bloom * 0.55);
        g = mix(g, 196, bloom * 0.55);
        b = mix(b, 182, bloom * 0.55);
        // darker damp patches where water has soaked through
        const damp = sm(0.5, 0.75, fDamp(u, v)) * (0.4 + 0.6 * sm(0.6, 0.1, v)) * (1 - bloom);
        r *= 1 - damp * 0.22;
        g *= 1 - damp * 0.24;
        b *= 1 - damp * 0.22;
        // green algae round the foot where it stays damp
        const alg = v > 0.3 ? 0 : sm(0.16, 0.0, v + (pf(u * 12, v * 6, 12, 0, 3, 79) - 0.5) * 0.14);
        r = mix(r, 88, alg * 0.6);
        g = mix(g, 96, alg * 0.6);
        b = mix(b, 56, alg * 0.6);
        out[0] = r;
        out[1] = g;
        out[2] = b;
        const rings = Math.sin(v * H * 0.35 + pn(u * 6, v * 4, 6, 0, 83) * 4) * 0.5 + 0.5;
        return rings * 0.06 + fine * 0.06 + (speck > 0.988 ? -0.35 : 0) + bloom * 0.1;
      },
      { strength: 1.2, wrapY: false },
    );
  });
}

// ---------------------------------------------------------------- stone

// Riven sandstone flags, 0.6 m per tile: buff grey with bedding layers, iron
// staining, speckle, crusty lichen, darker weathering. Tiles both ways.
export function stoneTextures() {
  return cached('stone', () => {
    const S = 256;
    return build(
      S,
      S,
      (x, y, out) => {
        const u = x / S;
        const v = y / S;
        const big = pf(u * 3, v * 3, 3, 3, 4, 91);
        const layer = pf(u * 2 + big, v * 12, 2, 12, 3, 93);
        const grit = pn(u * 180, v * 180, 180, 180, 95);
        const iron = sm(0.62, 0.85, pf(u * 4, v * 4, 4, 4, 2, 97));
        let r = mix(112, 152, big) + (layer - 0.5) * 26;
        let g = mix(108, 144, big) + (layer - 0.5) * 22;
        let b = mix(98, 128, big) + (layer - 0.5) * 18;
        r = mix(r, 150, iron * 0.35);
        g = mix(g, 118, iron * 0.35);
        b = mix(b, 84, iron * 0.35);
        const f = 0.88 + 0.22 * grit;
        r *= f;
        g *= f;
        b *= f;
        // lichen: small pale grey-green crusts, a rare yellow one
        const lc = pf(u * 16, v * 16, 16, 16, 2, 99);
        const lichen = sm(0.7, 0.73, lc);
        const yl = sm(0.78, 0.8, pf(u * 20, v * 20, 20, 20, 2, 101));
        r = mix(r, 178, lichen * 0.6);
        g = mix(g, 182, lichen * 0.6);
        b = mix(b, 162, lichen * 0.6);
        r = mix(r, 190, yl * 0.55);
        g = mix(g, 160, yl * 0.55);
        b = mix(b, 72, yl * 0.55);
        const dark = sm(0.45, 0.2, pf(u * 5, v * 5, 5, 5, 3, 103));
        r *= 1 - dark * 0.3;
        g *= 1 - dark * 0.28;
        b *= 1 - dark * 0.25;
        out[0] = r;
        out[1] = g;
        out[2] = b;
        return big * 1.0 + layer * 0.7 + grit * 0.35 + lichen * 0.2;
      },
      { strength: 1.5 },
    );
  });
}

// ---------------------------------------------------------------- leaves

// Four leaf-cluster cards (2 x 2 atlas, alpha): 0 privet / beech hedge,
// 1 birch, 2 broadleaf (apple, oak), 3 climbing rose with a few flowers.
// Each cluster is a spray of real-looking leaves on thin twigs.
export function leafTextures() {
  return cached('leaves', () => {
    const S = 1024;
    const T = S / 2;
    const c = canvasOf(S, S);
    const cx = c.getContext('2d');
    const rnd = seeded(7);
    const kinds = [
      { n: 170, len: [12, 20], wid: 0.55, hue: [82, 100], sat: [30, 44], lit: [15, 29], tip: 0.2, dense: true },
      { n: 90, len: [18, 30], wid: 0.62, hue: [62, 80], sat: [45, 65], lit: [26, 42], tip: 0.6 },
      { n: 55, len: [32, 52], wid: 0.48, hue: [72, 96], sat: [38, 58], lit: [18, 34], tip: 0.35 },
      { n: 110, len: [22, 34], wid: 0.62, hue: [92, 112], sat: [30, 45], lit: [13, 25], tip: 0.3, rose: true },
    ];
    kinds.forEach((k, idx) => {
      const ox = (idx % 2) * T;
      const oy = Math.floor(idx / 2) * T;
      cx.save();
      cx.beginPath();
      cx.rect(ox, oy, T, T);
      cx.clip();
      if (k.dense) {
        // a clipped hedge's surface: a dense dome of small leaves, no twigs
        for (let i = 0; i < k.n; i++) {
          const a = rnd() * Math.PI * 2;
          const r = Math.sqrt(rnd()) * T * 0.4;
          const px = ox + T / 2 + Math.cos(a) * r;
          const py = oy + T / 2 + Math.sin(a) * r * 0.9;
          const len = k.len[0] + rnd() * (k.len[1] - k.len[0]);
          const lit = k.lit[0] + rnd() * (k.lit[1] - k.lit[0]) + (1 - r / (T * 0.4)) * 4;
          drawLeaf(cx, px, py, a + (rnd() - 0.5) * 1.6, len * 1.6, len * 1.6 * k.wid, k.hue[0] + rnd() * (k.hue[1] - k.hue[0]), k.sat[0] + rnd() * (k.sat[1] - k.sat[0]), lit, k.tip);
        }
        cx.restore();
        return;
      }
      // twigs radiating from near the bottom centre
      cx.strokeStyle = 'rgba(70,52,34,1)';
      cx.lineCap = 'round';
      const twigs = [];
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
        const len = T * (0.3 + rnd() * 0.18);
        const sx = ox + T / 2 + (rnd() - 0.5) * 40;
        const sy = oy + T * 0.82;
        const ex = sx + Math.cos(a) * len;
        const ey = sy + Math.sin(a) * len;
        cx.lineWidth = 3 + rnd() * 2;
        cx.beginPath();
        cx.moveTo(sx, sy);
        cx.quadraticCurveTo((sx + ex) / 2 + (rnd() - 0.5) * 30, (sy + ey) / 2, ex, ey);
        cx.stroke();
        twigs.push([sx, sy, ex, ey]);
      }
      for (let i = 0; i < k.n; i++) {
        const tw = twigs[i % twigs.length];
        const t = 0.15 + rnd() * 0.85;
        const px = mix(tw[0], tw[2], t) + (rnd() - 0.5) * 34;
        const py = mix(tw[1], tw[3], t) + (rnd() - 0.5) * 34;
        const ang = Math.atan2(tw[3] - tw[1], tw[2] - tw[0]) + (rnd() - 0.5) * 2.4;
        const len = k.len[0] + rnd() * (k.len[1] - k.len[0]);
        const hue = k.hue[0] + rnd() * (k.hue[1] - k.hue[0]);
        const sat = k.sat[0] + rnd() * (k.sat[1] - k.sat[0]);
        const lit = k.lit[0] + rnd() * (k.lit[1] - k.lit[0]);
        drawLeaf(cx, px, py, ang, len * 1.6, len * 1.6 * k.wid, hue, sat, lit, k.tip);
      }
      if (k.rose) {
        for (let i = 0; i < 3; i++) {
          const px = ox + T * (0.22 + rnd() * 0.56);
          const py = oy + T * (0.18 + rnd() * 0.45);
          drawRose(cx, px, py, 20 + rnd() * 10, rnd);
        }
      }
      cx.restore();
    });
    const map = toTexture(c, true, { repeat: false });
    map.premultiplyAlpha = false;
    return { map };
  });
}

function drawLeaf(cx, x, y, ang, len, wid, hue, sat, lit, tip) {
  cx.save();
  cx.translate(x, y);
  cx.rotate(ang);
  const g = cx.createLinearGradient(0, -wid / 2, 0, wid / 2);
  g.addColorStop(0, `hsl(${hue},${sat}%,${lit + 8}%)`);
  g.addColorStop(0.5, `hsl(${hue},${sat}%,${lit + 3}%)`);
  g.addColorStop(1, `hsl(${hue + 4},${sat - 6}%,${lit - 5}%)`);
  cx.fillStyle = g;
  cx.beginPath();
  cx.moveTo(0, 0);
  cx.bezierCurveTo(len * 0.25, -wid * 0.62, len * (0.7 + tip * 0.2), -wid * 0.45, len, 0);
  cx.bezierCurveTo(len * (0.7 + tip * 0.2), wid * 0.45, len * 0.25, wid * 0.62, 0, 0);
  cx.fill();
  // midrib
  cx.strokeStyle = `hsla(${hue - 10},${sat - 15}%,${lit + 14}%,0.55)`;
  cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(len * 0.04, 0);
  cx.lineTo(len * 0.92, 0);
  cx.stroke();
  cx.restore();
}

function drawRose(cx, x, y, r, rnd) {
  // outer petals pale, deepening to a tighter, darker centre
  const hue = 340 + rnd() * 14;
  for (let ring = 0; ring < 3; ring++) {
    const rr = r * (1 - ring * 0.28);
    const n = 6 - ring;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6 + ring;
      const g = cx.createRadialGradient(x, y, rr * 0.1, x, y, rr);
      g.addColorStop(0, `hsl(${hue},${50 + ring * 8}%,${48 + ring * 4}%)`);
      g.addColorStop(1, `hsl(${hue + 6},${45 + ring * 6}%,${74 - ring * 6}%)`);
      cx.fillStyle = g;
      cx.beginPath();
      cx.ellipse(x + Math.cos(a) * rr * 0.4, y + Math.sin(a) * rr * 0.4, rr * 0.55, rr * 0.44, a, 0, Math.PI * 2);
      cx.fill();
    }
  }
  cx.fillStyle = `hsl(${hue - 4},55%,40%)`;
  cx.beginPath();
  cx.arc(x, y, r * 0.16, 0, Math.PI * 2);
  cx.fill();
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A clipped hedge face seen close: thousands of small overlapping leaves
// with dark gaps. 512 px per 0.8 m, tiles both ways; the normal map comes from
// the leaves' brightness (leaves stand out of the dark gaps).
export function hedgeTextures() {
  return cached('hedge', () => {
    const S = 512;
    const c = canvasOf(S, S);
    const cx = c.getContext('2d');
    cx.fillStyle = 'rgb(30,42,20)';
    cx.fillRect(0, 0, S, S);
    const rnd = seeded(21);
    const leaf = (x, y, ang, len, fill) => {
      cx.save();
      cx.translate(x, y);
      cx.rotate(ang);
      cx.fillStyle = fill;
      cx.beginPath();
      cx.moveTo(0, 0);
      cx.bezierCurveTo(len * 0.25, -len * 0.34, len * 0.75, -len * 0.26, len, 0);
      cx.bezierCurveTo(len * 0.75, len * 0.26, len * 0.25, len * 0.34, 0, 0);
      cx.fill();
      cx.restore();
    };
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 900; i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const ang = rnd() * Math.PI * 2;
        const len = 12 + rnd() * 10;
        const lit = 16 + layer * 6 + rnd() * 10;
        const fill = `hsl(${80 + rnd() * 22},${30 + rnd() * 18}%,${lit}%)`;
        const shadow = 'rgba(12,20,8,0.35)';
        // copies across the edges so the texture tiles
        const xs = x < 30 ? [x, x + S] : x > S - 30 ? [x, x - S] : [x];
        const ys = y < 30 ? [y, y + S] : y > S - 30 ? [y, y - S] : [y];
        for (const px of xs) {
          for (const py of ys) {
            leaf(px + 2, py + 3, ang, len, shadow);
            leaf(px, py, ang, len, fill);
          }
        }
      }
    }
    const img = cx.getImageData(0, 0, S, S).data;
    const hs = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) hs[i] = (img[i * 4] * 0.3 + img[i * 4 + 1] * 0.6 + img[i * 4 + 2] * 0.1) / 255;
    return { map: toTexture(c, true), normalMap: normalsFrom(hs, S, S, 5) };
  });
}

// Foliage seen from far away: no single leaves, just rounded clumps of
// leaves, sunlit on top and dark underneath, packed like a cauliflower.
// 256 px tile; used for distant tree lines and the insides of crowns.
export function canopyTextures() {
  return cached('canopy', () => {
    const S = 256;
    const c = canvasOf(S, S);
    const cx = c.getContext('2d');
    cx.fillStyle = 'rgb(18,28,14)';
    cx.fillRect(0, 0, S, S);
    const rnd = seeded(33);
    const blobs = [];
    for (let i = 0; i < 520; i++) blobs.push([rnd() * S, rnd() * S, 7 + rnd() * 13, rnd()]);
    // lower clumps overlap the ones above them
    blobs.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r, k] of blobs) {
      const xs = x < r ? [x, x + S] : x > S - r ? [x, x - S] : [x];
      const ys = y < r ? [y, y + S] : y > S - r ? [y, y - S] : [y];
      for (const px of xs) {
        for (const py of ys) {
          const g = cx.createRadialGradient(px - r * 0.3, py - r * 0.4, r * 0.1, px, py, r);
          const h = 84 + k * 18;
          g.addColorStop(0, `hsl(${h},${34 + k * 10}%,${30 + k * 10}%)`);
          g.addColorStop(0.6, `hsl(${h + 4},${38}%,${19 + k * 5}%)`);
          g.addColorStop(1, 'hsl(100,40%,9%)');
          cx.fillStyle = g;
          cx.beginPath();
          cx.arc(px, py, r, 0, Math.PI * 2);
          cx.fill();
        }
      }
    }
    const img = cx.getImageData(0, 0, S, S).data;
    const hs = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) hs[i] = (img[i * 4] * 0.3 + img[i * 4 + 1] * 0.6 + img[i * 4 + 2] * 0.1) / 255;
    return { map: toTexture(c, true), normalMap: normalsFrom(hs, S, S, 4) };
  });
}

// ---------------------------------------------------------------- bark

// Bark, u around the trunk (tiles), v up (tiles, 1 m per tile):
// 0 = silver birch (white with dark lenticels and fissured patches),
// 1 = rough grey-brown bark with vertical fissures (apple, oak).
export function barkTextures(kind = 0) {
  return cached(`bark${kind}`, () => {
    const W = 128;
    const H = 256;
    return build(
      W,
      H,
      (x, y, out) => {
        const u = x / W;
        const v = y / H;
        if (kind === 0) {
          const len = pn(u * 5, v * 60, 5, 60, 111);
          const lenticel = sm(0.72, 0.8, len) * sm(0.3, 0.6, pn(u * 30, v * 60, 30, 60, 113));
          const patch = sm(0.6, 0.75, pf(u * 3, v * 5, 3, 5, 4, 115));
          const t = 0.9 + 0.1 * pn(u * 60, v * 120, 60, 120, 117);
          out[0] = mix(mix(228, 60, lenticel), 70, patch) * t;
          out[1] = mix(mix(224, 56, lenticel), 64, patch) * t;
          out[2] = mix(mix(212, 52, lenticel), 58, patch) * t;
          return -lenticel * 0.6 - patch * 1.2 + t * 0.3;
        }
        const fiss = pf(u * 10, v * 2, 10, 2, 4, 121);
        const ridge = sm(0.35, 0.6, fiss);
        const t = 0.85 + 0.2 * pn(u * 40, v * 50, 40, 50, 123);
        const moss = sm(0.6, 0.8, pf(u * 4, v * 3, 4, 3, 3, 125)) * 0.6;
        out[0] = mix(mix(52, 118, ridge), 90, moss) * t;
        out[1] = mix(mix(46, 108, ridge), 108, moss) * t;
        out[2] = mix(mix(40, 96, ridge), 52, moss) * t;
        return ridge * 1.5 + t * 0.3;
      },
      { strength: 3 },
    );
  });
}

// ---------------------------------------------------------------- brick

// London stock brick in stretcher bond, 0.9 m square per tile (4 bricks
// by 12 courses): yellow-buff bricks mottled with grey, charcoal and
// rust, recessed lime mortar, soot in places.
export function brickTextures() {
  return cached('brick', () => {
    const S = 512;
    const cw = S / 4;
    const ch = S / 12;
    const mort = 5;
    return build(
      S,
      S,
      (x, y, out) => {
        const row = Math.floor(y / ch);
        const off = row % 2 ? cw / 2 : 0;
        const bx = Math.floor((x + off) / cw);
        const lx = (x + off) % cw;
        const ly = y - row * ch;
        const id = ((bx % 4) + 4) % 4;
        const inMortar = lx < mort || ly < mort;
        const e = Math.min(lx - mort, ly - mort, cw - lx, ch - ly);
        const u = x / S;
        const v = y / S;
        if (inMortar) {
          const n = pn(u * 120, v * 120, 120, 120, 131);
          out[0] = 168 + n * 20;
          out[1] = 160 + n * 18;
          out[2] = 142 + n * 16;
          return -0.9 + n * 0.1;
        }
        const k1 = ih(id, row, 133);
        const k2 = ih(id, row, 135);
        let r = mix(170, 196, k1);
        let g = mix(142, 164, k1);
        let b = mix(98, 116, k1);
        if (k2 > 0.8) {
          r *= 0.62;
          g *= 0.6;
          b *= 0.62;
        } else if (k2 < 0.15) {
          r = mix(r, 170, 0.5);
          g = mix(g, 100, 0.5);
          b = mix(b, 64, 0.5);
        }
        const m = pf(u * 24, v * 24, 24, 24, 4, 137);
        const spot = ih(x, y, 139) > 0.97 ? 0.75 : 1;
        const soot = sm(0.55, 0.8, pf(u * 3, v * 2, 3, 2, 3, 141)) * 0.35;
        const f = (0.82 + 0.3 * m) * spot * (1 - soot);
        out[0] = r * f;
        out[1] = g * f;
        out[2] = b * f;
        return Math.min(1, e * 0.25) * 0.5 + m * 0.35;
      },
      { strength: 2.4 },
    );
  });
}

// ---------------------------------------------------------------- wicker

// Buff willow wicker: flat weavers over and under round stakes. Tiles both
// ways; 0.1 m per tile, v up the basket.
export function wickerTextures() {
  return cached('wicker', () => {
    const S = 256;
    const stakes = 5;
    const rows = 16;
    return build(
      S,
      S,
      (x, y, out) => {
        const u = x / S;
        const v = y / S;
        const row = Math.floor(v * rows);
        const fv = v * rows - row;
        const col = u * stakes;
        const fc = col - Math.floor(col);
        const over = (Math.floor(col) + row) % 2 === 0;
        // the weaver bulges over a stake and dips behind the next
        const bulge = Math.sin(fc * Math.PI) * (over ? 1 : -1);
        const prof = Math.sin(fv * Math.PI);
        const gap = sm(0.08, 0.0, Math.min(fv, 1 - fv));
        const k = ih(row, 3, 151);
        const n = pn(u * 60, v * 200, 60, 200, 153);
        const shade = 0.72 + 0.28 * prof + 0.12 * bulge;
        out[0] = mix(186, 150, k) * shade * (0.92 + 0.12 * n) * (1 - gap * 0.7);
        out[1] = mix(146, 112, k) * shade * (0.92 + 0.12 * n) * (1 - gap * 0.7);
        out[2] = mix(96, 70, k) * shade * (0.92 + 0.12 * n) * (1 - gap * 0.7);
        return prof * 0.8 + bulge * 0.5 - gap;
      },
      { strength: 3 },
    );
  });
}
