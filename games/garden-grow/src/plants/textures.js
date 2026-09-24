// Painted textures shared by the flowers. A leaf atlas has three regions
// side by side (u): the blade with its venation (0 .. 0.70), a plain smooth
// leaf for seed leaves, sepals and bracts (0.72 .. 0.85), and a stem strip
// (0.87 .. 0.99). v runs from the base (0) to the tip (1). Each species
// paints its own once, the first time one is planted.
import { paint, paintNormal, mixRGB, noise2, fbm } from './common.js';

export const BLADE_UV = [0.0, 0.7, 0, 1];
export const PLAIN_UV = [0.72, 0.85, 0, 1];
export const STEM_U = [0.87, 0.99];

const sm = (a, b, x) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// Cellular noise: distance to the nearest and second nearest feature point.
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function worley(x, y, out) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i;
      const cy = iy + j;
      const px = cx + hash2(cx, cy);
      const py = cy + hash2(cy + 17.3, cx - 4.1);
      const d = Math.hypot(px - x, py - y);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash2(cx * 1.7, cy * 3.1);
      } else if (d < d2) d2 = d;
    }
  }
  out[0] = d1;
  out[1] = d2;
  out[2] = id;
  return out;
}

// Vein and surface fields for a blade at (x across 0..1, y base..tip).
// Returns [veins 0..1, midrib 0..1, areole bump 0..1, edge 0..1].
function bladeFields(x, y, o, out, w3) {
  const d = Math.abs(x - 0.5) * 2;
  const ribW = o.ribW * (1.4 - 0.9 * y);
  const rib = Math.exp(-(((x - 0.5) / ribW) ** 2));
  let veins = 0;
  if (o.venation === 'parallel') {
    const line = Math.abs(Math.cos(Math.PI * o.veins * (x - 0.5) + 0.5 * noise2(x * 6, y * 3)));
    veins = Math.pow(line, 14) * 0.7;
  } else {
    // pinnate: secondaries leave the midrib and sweep up towards the margin
    const warp = 0.02 * (noise2(x * 9, y * 9) - 0.5);
    const phase = (y - o.angle * Math.pow(d, 0.8) + warp) * o.veins + (x < 0.5 ? o.offset : 0);
    const f = phase - Math.floor(phase);
    const dist = Math.min(f, 1 - f);
    const w = 0.07 * (1 - 0.6 * d) + 0.012;
    veins = (1 - sm(0, w, dist)) * (1 - sm(0.82, 0.98, d)) * sm(0.02, 0.1, y) * (1 - sm(0.93, 1, y));
    if (o.basal) {
      // two strong veins from the base (heart-shaped leaves)
      for (const s of [-1, 1]) {
        const bx = 0.5 + s * (0.34 * Math.pow(Math.min(1, y / 0.75), 0.7)) * (1 - 0.6 * sm(0.5, 1, y));
        veins = Math.max(veins, Math.exp(-(((x - bx) / 0.012) ** 2)) * (1 - sm(0.7, 0.95, y)));
      }
    }
  }
  worley(x * o.net * 0.5, y * o.net, w3);
  const cell = w3[1] - w3[0];
  const net = 1 - sm(0.0, 0.07, cell);
  out[0] = Math.max(veins, net * o.netK * (1 - sm(0.8, 1, d)));
  out[1] = rib;
  out[2] = sm(0.0, 0.45, w3[0]) * o.quilt;
  out[3] = sm(0.9, 1.0, d);
  return out;
}

// o: { c1, c2, vein, rib, edge, venation, veins, angle, offset, net, netK,
//      quilt, basal, bloom (glaucous tint), hair, stem1, stem2, stemHair,
//      plain1, plain2, teeth (serration count per side, 0 none), toothDepth }
export function leafAtlas(o) {
  o = {
    c1: [0.2, 0.36, 0.12],
    c2: [0.3, 0.46, 0.18],
    vein: [0.55, 0.66, 0.3],
    rib: [0.6, 0.7, 0.35],
    edge: [0.35, 0.45, 0.2],
    venation: 'pinnate',
    veins: 9,
    angle: 0.3,
    offset: 0.5,
    ribW: 0.018,
    net: 26,
    netK: 0.35,
    quilt: 0.5,
    basal: false,
    bloom: null,
    hair: 0,
    stem1: [0.3, 0.46, 0.2],
    stem2: [0.4, 0.54, 0.26],
    stemHair: 0,
    plain1: [0.3, 0.48, 0.18],
    plain2: [0.38, 0.55, 0.22],
    teeth: 0,
    toothDepth: 0.06,
    size: [256, 512],
    ...o,
  };
  const [W, H] = o.size;
  const f = [0, 0, 0, 0];
  const w3 = [0, 0, 0];
  const c = [0, 0, 0];
  const map = paint(W, H, (u, v, out) => {
    if (u > 0.86) {
      // stem: fine lengthwise streaks, maybe hairs
      const x = (u - 0.87) / 0.12;
      const n = fbm(x * 3, v * 50, 3);
      mixRGB(o.stem1, o.stem2, n * 0.8 + 0.2 * (0.5 + 0.5 * Math.cos(x * 40 + n * 3)), c);
      if (o.stemHair) {
        const h = noise2(x * 60, v * 400);
        const k = sm(0.78, 0.9, h) * o.stemHair;
        mixRGB(c, [0.85, 0.88, 0.8], k * 0.6, c);
      }
      out[0] = c[0];
      out[1] = c[1];
      out[2] = c[2];
      return;
    }
    if (u > 0.71) {
      // plain leaf for cotyledons, sepals and bracts
      const x = (u - 0.72) / 0.13;
      const n = fbm(x * 3, v * 6, 3);
      mixRGB(o.plain1, o.plain2, n, c);
      const rib = Math.exp(-(((x - 0.5) / 0.03) ** 2)) * sm(0.0, 0.2, v) * (1 - sm(0.6, 1, v));
      mixRGB(c, o.rib, rib * 0.3, c);
      if (o.hair) mixRGB(c, [0.8, 0.84, 0.76], sm(0.8, 0.9, noise2(x * 90, v * 180)) * o.hair * 0.4, c);
      out[0] = c[0];
      out[1] = c[1];
      out[2] = c[2];
      return;
    }
    const x = Math.min(1, u / 0.7);
    bladeFields(x, v, o, f, w3);
    const n = fbm(x * 4, v * 9, 4);
    mixRGB(o.c1, o.c2, n, c);
    if (o.bloom) mixRGB(c, o.bloom, sm(0.4, 0.75, fbm(x * 2.5 + 5, v * 5, 3)) * 0.4, c);
    // areoles catch the light a touch on their domes
    const quilt = f[2];
    c[0] *= 0.92 + 0.12 * quilt;
    c[1] *= 0.92 + 0.12 * quilt;
    c[2] *= 0.92 + 0.12 * quilt;
    mixRGB(c, o.vein, f[0] * 0.55, c);
    mixRGB(c, o.rib, f[1] * 0.75, c);
    mixRGB(c, o.edge, f[3] * 0.6, c);
    if (o.hair) mixRGB(c, [0.78, 0.82, 0.74], sm(0.82, 0.92, noise2(x * 120, v * 240)) * o.hair * 0.35, c);
    out[0] = c[0];
    out[1] = c[1];
    out[2] = c[2];
    if (o.teeth) {
      // serrated margin: teeth cut by alpha (the blade is a little wider)
      const d = Math.abs(x - 0.5) * 2;
      const t = v * o.teeth;
      const saw = t - Math.floor(t);
      const inset = o.toothDepth * (0.25 + 0.75 * saw) * sm(0.03, 0.12, v) * (1 - sm(0.94, 1, v) * 0.5);
      out[3] = d < 1 - inset ? 1 : 0;
    }
  });
  const normalMap = paintNormal(W, H, (u, v) => {
    if (u > 0.86) {
      const x = (u - 0.87) / 0.12;
      return 0.5 + 0.5 * Math.cos(x * 40 + fbm(x * 3, v * 50, 2) * 3) + (o.stemHair ? sm(0.8, 0.9, noise2(x * 60, v * 400)) * o.stemHair : 0);
    }
    if (u > 0.71) return fbm((u - 0.72) * 30, v * 20, 2) * 0.3 - Math.exp(-((((u - 0.72) / 0.13 - 0.5) / 0.03) ** 2)) * 0.4;
    const x = Math.min(1, u / 0.7);
    bladeFields(x, v, o, f, w3);
    return -f[0] * 0.9 - f[1] * 1.4 + f[2] * 0.8 + fbm(x * 30, v * 60, 2) * 0.15;
  }, 2.4);
  return { map, normalMap };
}

// ------------------------------------------------------------ composite heads

// Daisy-family heads: a ray petal (u 0 .. 0.38), a plain region for bracts
// (0.40 .. 0.46) and the disc of florets, polar-mapped in a square
// (u 0.5 .. 1, v 0.25 .. 0.75; centre DISC_C, radius DISC_R).
export const RAY_UV = [0.0, 0.38, 0, 1];
export const BRACT_UV = [0.4, 0.46, 0.05, 0.95];
export const DISC_C = [0.75, 0.5];
export const DISC_R = 0.24;

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const FIB = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

// Nearest floret of a golden-angle disc of n florets to (x, y) in -1..1.
// Returns [distance / spacing, floret radius 0..1 from the centre].
function nearestFloret(x, y, n, out) {
  const r = Math.hypot(x, y);
  const k0 = Math.round(r * r * n);
  let best = 9;
  let br = 0;
  for (const f of FIB) {
    for (const s of f === 0 ? [0] : [-1, 1]) {
      const k = k0 + s * f;
      if (k < 0 || k >= n) continue;
      const rk = Math.sqrt((k + 0.5) / n);
      const a = k * GOLDEN;
      const d = Math.hypot(x - rk * Math.cos(a), y - rk * Math.sin(a));
      if (d < best) {
        best = d;
        br = rk;
      }
    }
  }
  out[0] = best * Math.sqrt(n) * 0.5;
  out[1] = br;
  return out;
}

// o: { size, ray: { base, tip, veins, notches, notchDepth, pointed },
//      disc: { n, center, mid, ring, pollen, open (0..1 how far in florets
//      are open), dark (sunflower: dark ring of open florets) } }
export function compositeAtlas(o) {
  const size = o.size ?? 512;
  const ray = { base: 0.85, tip: 1, veins: 9, notches: 0, notchDepth: 0.08, ...o.ray };
  const disc = { n: 600, center: [0.55, 0.62, 0.2], mid: [0.95, 0.72, 0.1], ring: [0.98, 0.78, 0.12], pollen: [1, 0.86, 0.3], open: 0.55, ...o.disc };
  const nf = [0, 0];
  const c = [0, 0, 0];
  const discFields = (u, v, out) => {
    const x = (u - DISC_C[0]) / DISC_R;
    const y = (v - DISC_C[1]) / DISC_R;
    nearestFloret(x, y, disc.n, nf);
    const d = nf[0];
    const r = nf[1];
    out[0] = d;
    out[1] = r;
    out[2] = Math.hypot(x, y);
    return out;
  };
  const f3 = [0, 0, 0];
  const map = paint(size, size, (u, v, out) => {
    out[3] = 1;
    if (u < 0.39) {
      // ray petal: fine parallel veins that meet at the base, a notched tip
      const x = u / 0.38;
      const w = 0.35 + 0.65 * Math.sin(Math.min(1, v / 0.25) * Math.PI * 0.5);
      const xx = (x - 0.5) / w;
      const vein = Math.pow(Math.abs(Math.cos(Math.PI * ray.veins * xx + 0.6 * noise2(xx * 4, v * 6))), 10);
      let l = mixN(ray.base, ray.tip, sm(0.0, 0.35, v)) * (0.95 + 0.05 * fbm(x * 3, v * 10, 3)) - (ray.veinK ?? 0.03) * vein;
      out[0] = out[1] = out[2] = Math.min(1, l);
      if (ray.notches) {
        // small V notches between the lobes of the tip
        const t = x * (ray.notches + 1);
        const k = Math.round(t);
        const db = k >= 1 && k <= ray.notches ? Math.abs(t - k) : 1;
        const depth = ray.notchDepth * Math.max(0, 1 - db * 5);
        if (v > 1 - depth) out[3] = 0;
      }
      if (ray.pointed && v > 0.9) {
        if (Math.abs(x - 0.5) > (1 - v) / 0.1 * 0.5) out[3] = 0;
      }
      return;
    }
    if (u < 0.48) {
      const l = 0.8 + 0.15 * fbm(u * 60, v * 20, 3);
      out[0] = out[1] = out[2] = l;
      return;
    }
    if (v < 0.24 || v > 0.76) {
      out[0] = out[1] = out[2] = 0.8;
      return;
    }
    discFields(u, v, f3);
    const d = f3[0];
    const rr = f3[1];
    const openK = sm(1 - disc.open - 0.08, 1 - disc.open + 0.08, rr);
    mixRGB(disc.center, disc.mid, sm(0.0, 0.6, rr), c);
    mixRGB(c, disc.ring, openK, c);
    // each floret: a rounded cap, darker between them; open ones show a
    // star of lobes with pollen at the middle
    const cap = Math.max(0, 1 - d * d * 1.6);
    const gapD = sm(0.6, 0.95, d);
    const shade = disc.capShade ?? 0.45;
    c[0] *= 1 - shade + (shade + 0.05) * cap;
    c[1] *= 1 - shade + (shade + 0.05) * cap;
    c[2] *= 1 - shade + (shade + 0.05) * cap;
    if (disc.dark) {
      // sunflower: brown-black florets in the middle, open ones ringed gold
      mixRGB(c, disc.dark, (1 - openK) * 0.85, c);
    }
    const pol = openK * sm(0.35, 0.0, d) * (0.6 + 0.4 * noise2(u * 400, v * 400));
    mixRGB(c, disc.pollen, pol * 0.8, c);
    mixRGB(c, disc.gap ?? [0.1, 0.07, 0.03], gapD * (disc.gapK ?? 0.7), c);
    out[0] = c[0];
    out[1] = c[1];
    out[2] = c[2];
  });
  const normalMap = paintNormal(size, size, (u, v) => {
    if (u < 0.39) {
      const x = u / 0.38;
      const w = 0.35 + 0.65 * Math.sin(Math.min(1, v / 0.25) * Math.PI * 0.5);
      const xx = (x - 0.5) / w;
      return Math.pow(Math.abs(Math.cos(Math.PI * ray.veins * xx + 0.6 * noise2(xx * 4, v * 6))), 4) * 0.22 + fbm(x * 5, v * 14, 2) * 0.12;
    }
    if (u < 0.48 || v < 0.24 || v > 0.76) return fbm(u * 40, v * 40, 2) * 0.2;
    discFields(u, v, f3);
    return Math.sqrt(Math.max(0, 1 - f3[0] * f3[0] * 1.3)) * 0.9;
  }, 3.2);
  return { map, normalMap };
}

function mixN(a, b, k) {
  return a + (b - a) * k;
}

// uv on the disc for a point (x, z) within a disc of radius r.
export function discUV(x, z, r, o) {
  o.u = DISC_C[0] + (x / r) * DISC_R;
  o.v = DISC_C[1] + (z / r) * DISC_R;
  return o;
}
