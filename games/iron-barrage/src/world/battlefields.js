// The battlefields: light, sky, backdrop layers, ground materials, weather,
// the film grade and the shape of the land. Colours are linear.
import { rng, clamp } from '../config.js';

const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// A raised plateau with steep sides: height H, half width hw, edge width.
const plateau = (x, c, hw, edge, H) => sstep(0, 1, clamp((hw + edge - Math.abs(x - c)) / edge, 0, 1)) * H;

// Remembers where the ground stands before a sculpt cuts into it, so the terrain shader can draw
// the shadowed far wall of earth inside every cave, cellar and cutting (terrain.surf0, metres).
export function markSurface(t) {
  const { cols, rows, mask, res } = t;
  const surf = new Float32Array(cols);
  for (let i = 0; i < cols; i++) {
    let j = rows - 1;
    while (j > 0 && mask[j * cols + i] <= 127) j--;
    const v = mask[j * cols + i] / 255;
    const above = j + 1 < rows ? mask[(j + 1) * cols + i] / 255 : 0;
    surf[i] = (j + v + above) / res;
  }
  t.surf0 = surf;
}

// Cuts a tunnel into the ground along y = y0 from x0 to x1 (discs of radius r), only where
// there is rock enough above it, so nothing breaks through to daylight.
export function cave(t, x0, x1, y0, r, cover = 2.2) {
  const dir = Math.sign(x1 - x0) || 1;
  for (let x = x0; (x1 - x) * dir >= 0; x += dir * 1.0) {
    const d = Math.abs(x - x0);
    const rr = r * (0.8 + 0.3 * Math.sin(x * 0.45) + 0.12 * Math.sin(x * 1.3));
    const y = y0 - d * 0.12 + Math.sin(x * 0.21) * 0.6;
    if (t.top(x) - (y + rr) < cover && d > 6) break;
    t.carve(x, y, rr);
  }
}

// Carves a rectangle (a cellar, a trench) with its top at y1.
export function pit(t, x0, x1, y0, y1) {
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) t.carve(x, y, 1.15);
}


const norm = (x, y, z) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

// Smooth 1D noise from a seeded lattice, for terrain profiles.
export function noise1(seed) {
  const r = rng(seed);
  const v = new Float32Array(512);
  for (let i = 0; i < v.length; i++) v[i] = r();
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = v[((i % 512) + 512) % 512];
    const b = v[(((i + 1) % 512) + 512) % 512];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

export function fbm1(seed, oct = 5) {
  const n = noise1(seed);
  return (x) => {
    let a = 0;
    let w = 0.5;
    let t = 0;
    for (let o = 0; o < oct; o++) {
      a += n(x + o * 37.1) * w;
      t += w;
      w *= 0.5;
      x *= 2.03;
    }
    return a / t;
  };
}

// A gentle flat spot for a tank to start on.
export function flatten(h, x0, width) {
  return (x) => {
    const d = Math.abs(x - x0) / width;
    if (d >= 1) return h(x);
    const t = d * d * (3 - 2 * d);
    return h(x0) * (1 - t) + h(x) * t;
  };
}


// Layer fields (see gl/bake.js for the painters): kind, width/height (m), texW/texH, base (ground
// line) and amp (relief) as fractions of the height, color..color4, lit (lit windows and fires),
// p/q (painter parameters), parallax, scale, haze [r,g,b,amount], mist [ground line, falloff,
// extra haze at the ground line, sinking below it], emit [glow scale, flicker, heat shimmer],
// smoke columns [[u, height, width, lean]...], fire [cell m, share, flare share, size m].
export const BATTLEFIELDS = {
  // ------------------------------------------------------------------ Ashfield
  ashfield: {
    id: 'ashfield',
    name: 'Ashfield',
    blurb: 'Burnt farmland at dawn. Rolling fields, a ridge in the middle and smoke on the horizon.',
    seed: 11,
    ambience: 'farm',
    weather: 'ash',
    enemySkin: 'grey',
    sun: [...norm(-0.7, 0.42, 0.45), 0.3],
    sunCol: [2.1, 1.5, 1.0, 1],
    sky: [0.34, 0.35, 0.41, 1],
    ground: [0.16, 0.13, 0.1, 1],
    fog: [0.62, 0.5, 0.42, 0.004],
    zenith: [0.1, 0.19, 0.38],
    horizon: [1.05, 0.7, 0.5],
    sunGlow: [1.6, 0.85, 0.42],
    sunPos: [-1.05, 0.0],
    cloud: [0.5, 0.5, 0.004, 1.2],
    cloudCol: [0.7, 0.52, 0.48],
    skyA: [0.05, 0, 0.1, 0.5],
    skyB: [0.4, 1, 0, 0.7],
    stars: 0,
    layers: [
      {
        kind: 0, width: 600, height: 300, texW: 2048, texH: 1024, base: 0.27, amp: 0.26,
        color: [0.05, 0.06, 0.11], color2: [0.34, 0.28, 0.34], color3: [0.5, 0.45, 0.45], color4: [0.03, 0.045, 0.04],
        p: [0, 0.4, 0.3, 0.6], q: [0, 0, 0, 0], lit: [1, 0.55, 0.2],
        parallax: 0.03, scale: 3.4, haze: [0.72, 0.68, 0.86, 0.4], mist: [0.27, 7, 0.25, 0.3], emit: [2, 0.4, 0, 0],
        seed: 0.13, lightK: 0,
        smoke: [[110, 200, 6, 0.4], [330, 160, 6, 0.3], [482, 215, 8, 0.5]], smokeCol: [0.1, 0.085, 0.09], smokeOp: 0.75, smokeBase: 0.2,
        fire: [90, 0.25, 0, 10],
      },
      {
        kind: 1, width: 600, height: 160, texW: 4096, texH: 1024, base: 0.3, amp: 0.3, drop: 4,
        color: [0.02, 0.032, 0.022], color2: [0.07, 0.05, 0.03], color3: [0.17, 0.14, 0.05], color4: [0.018, 0.03, 0.02], lit: [1, 0.5, 0.15],
        p: [0.9, 13, 46, 0.9], q: [0, 0.8, 0.45, 0],
        parallax: 0.12, scale: 2.1, haze: [0.88, 0.68, 0.66, 0.1], mist: [0.3, 7, 0.08, 0.4], emit: [2.2, 0.4, 0, 0],
        seed: 0.37, lightK: 0.01,
        smoke: [[200, 130, 5, 0.35], [430, 110, 4, 0.3]], smokeCol: [0.07, 0.062, 0.062], smokeOp: 0.7, smokeBase: 0.28,
        fire: [55, 0.3, 0, 9],
      },
      {
        kind: 6, width: 400, height: 90, texW: 4096, texH: 1024, base: 0.2, amp: 0.2, drop: 9,
        color: [0.012, 0.012, 0.012], color2: [0.04, 0.035, 0.025], color3: [0.1, 0.08, 0.035], color4: [0.015, 0.02, 0.012],
        p: [15, 12, 0.8, 0], q: [0, 0, 0, 0],
        parallax: 0.32, scale: 1.35, haze: [0.7, 0.52, 0.42, 0.06], mist: [0.2, 8, 0.04, 0.4],
        seed: 0.61, lightK: 0.04,
      },
    ],
    ground_: {
      top: [0.075, 0.066, 0.04, 0.28],
      soil: [0.062, 0.05, 0.04, 0.9],
      deep: [0.1, 0.075, 0.055, 0.7],
      rock: [0.2, 0.19, 0.17, 0.85],
      grass: [0.1, 0.09, 0.04, 0.6],
      mat: [0, 0.3, 0.3, 0],
      mat2: [0.9, 0, 0.55, 1.0],
      acc: [0.17, 0.13, 0.08],
      acc2: [0.15, 0.115, 0.08],
    },
    grade: { exposure: 1.0, bloom: 0.5, saturation: 0.95, contrast: 1.08, vignette: 0.4, warmth: 0.4, grain: 0.035, lift: [0.014, 0.012, 0.02], gain: [1.0, 0.98, 0.95] },
    bloomThreshold: 1.0,
    profile(seed) {
      const f = fbm1(seed, 5);
      const g = fbm1(seed + 7, 3);
      return (x) => 30 + 16 * f(x / 55) + 5 * g(x / 14) + 17 * gauss(x, 165, 38) - 6 * gauss(x, 105, 20) + 3.5 * gauss(x, 262, 12);
    },
    sculpt(t) {
      markSurface(t);
      // a drainage culvert cut into the flank of the ridge
      cave(t, 132, 160, t.top(126) + 2.2, 3.0);
    },
  },

  // ------------------------------------------------------------------ Red Dunes
  dunes: {
    id: 'dunes',
    name: 'Red Dunes',
    blurb: 'Desert at high noon. Wind-blown dunes, a sandstone mesa to shell over, heat haze and blowing sand.',
    seed: 23,
    ambience: 'desert',
    weather: 'dust',
    enemySkin: 'sand',
    sun: [...norm(-0.28, 0.9, 0.34), 0.85],
    sunCol: [3.1, 2.75, 2.2, 1],
    sky: [0.4, 0.48, 0.64, 1],
    ground: [0.34, 0.26, 0.18, 1],
    fog: [0.8, 0.7, 0.56, 0.003],
    zenith: [0.1, 0.3, 0.7],
    horizon: [0.95, 0.88, 0.74],
    sunGlow: [1.2, 1.05, 0.8],
    sunPos: [-0.4, 0.9],
    cloud: [0.16, 0.15, 0.006, 1.0],
    cloudCol: [1.0, 0.97, 0.92],
    skyA: [0.045, 0, 0, 0.55],
    skyB: [0.5, 1, 0, 0],
    stars: 0,
    layers: [
      {
        kind: 5, width: 600, height: 260, texW: 2048, texH: 1024, base: 0.2, amp: 0.34,
        color: [0.22, 0.1, 0.07], color2: [0.38, 0.22, 0.14], color3: [0.46, 0.33, 0.22], color4: [0.2, 0.1, 0.07],
        p: [135, 0.3, 0, 0], q: [0, 0, 0, 0],
        parallax: 0.03, scale: 3.4, haze: [0.7, 0.74, 0.82, 0.4], mist: [0.2, 6, 0.22, 0.4], emit: [0, 0, 0.5, 0],
        seed: 0.29, lightK: 0,
      },
      {
        kind: 3, width: 600, height: 150, texW: 4096, texH: 1024, base: 0.3, amp: 0.24,
        color: [0.16, 0.09, 0.06], color2: [0.62, 0.4, 0.24], color4: [0.14, 0.1, 0.07],
        p: [4, 9, 0.4, 0], q: [0, 0, 0, 0],
        parallax: 0.12, scale: 2.1, haze: [0.78, 0.74, 0.7, 0.2], mist: [0.3, 6, 0.12, 0.35], emit: [0, 0, 0.4, 0],
        seed: 0.51, lightK: 0,
      },
      {
        kind: 3, width: 400, height: 90, texW: 4096, texH: 1024, base: 0.2, amp: 0.22,
        color: [0.2, 0.11, 0.07], color2: [0.7, 0.46, 0.28], color4: [0.1, 0.085, 0.06],
        p: [3, 7, 0.8, 0.5], q: [0, 0, 0, 0],
        parallax: 0.32, scale: 1.35, haze: [0.76, 0.66, 0.55, 0.07], mist: [0.2, 6, 0.06, 0.5], emit: [0, 0, 0.25, 0],
        seed: 0.77, lightK: 0,
      },
    ],
    ground_: {
      top: [0.46, 0.34, 0.21, 1.5],
      soil: [0.32, 0.21, 0.13, 1.0],
      deep: [0.5, 0.4, 0.27, 0.5],
      rock: [0.1, 0.075, 0.06, 0.6],
      grass: [0.2, 0.17, 0.08, 0],
      mat: [1, 0, 0.55, 0],
      mat2: [0.5, 0, 0.8, 0],
      acc: [0.3, 0.13, 0.08],
      acc2: [0.4, 0.3, 0.2],
    },
    grade: { exposure: 0.92, bloom: 0.25, saturation: 0.95, contrast: 1.1, vignette: 0.3, warmth: 0.12, grain: 0.03, lift: [0.01, 0.01, 0.012], gain: [1.0, 0.99, 0.95] },
    bloomThreshold: 2.4,
    profile(seed) {
      const f = fbm1(seed, 4);
      const g = fbm1(seed + 5, 3);
      const w = fbm1(seed + 9, 2);
      const dune = (x, lam, off) => {
        const p0 = x / lam + off + (w(x / 90) - 0.5) * 0.8;
        const p = p0 - Math.floor(p0);
        return p < 0.7 ? Math.pow(p / 0.7, 1.25) : Math.pow(1 - (p - 0.7) / 0.3, 1.7);
      };
      return (x) => 27 + 13 * f(x / 95) + 2.5 * g(x / 12) + 9 * dune(x, 82, 0.15) * (0.7 + 0.6 * f(x / 60 + 3)) + plateau(x, 192, 20, 7, 19) - 9 * gauss(x, 108, 16);
    },
    sculpt(t) {
      markSurface(t);
      // a cave under the mesa's shaded face
      cave(t, 168, 196, t.top(164) + 3.0, 3.0);
    },
  },

  // ------------------------------------------------------------------ Frostline
  frostline: {
    id: 'frostline',
    name: 'Frostline',
    blurb: 'Winter forest under a grey sky. Snow over frozen ground, dark pines and a frozen stream bed.',
    seed: 37,
    ambience: 'snow',
    weather: 'snow',
    enemySkin: 'winter',
    sun: [...norm(-0.4, 0.62, 0.55), 0.45],
    sunCol: [0.9, 0.98, 1.1, 1],
    sky: [0.5, 0.56, 0.66, 1],
    ground: [0.38, 0.4, 0.44, 1],
    fog: [0.62, 0.68, 0.74, 0.004],
    zenith: [0.3, 0.37, 0.48],
    horizon: [0.7, 0.75, 0.8],
    sunGlow: [0.45, 0.5, 0.55],
    sunPos: [-0.6, 0.3],
    cloud: [0.4, 0.3, 0.003, 0.9],
    cloudCol: [0.62, 0.66, 0.72],
    skyA: [0, 0, 0.82, 0.3],
    skyB: [0, 1, 0, 0],
    stars: 0,
    layerLight: 0.5,
    layers: [
      {
        kind: 0, width: 600, height: 300, texW: 2048, texH: 1024, base: 0.27, amp: 0.34,
        color: [0.12, 0.14, 0.19], color2: [0.32, 0.37, 0.46], color3: [0.8, 0.85, 0.93], color4: [0.04, 0.06, 0.07],
        p: [0.8, 0.8, 0.3, 0], q: [0.15, 0, 0, 0],
        parallax: 0.03, scale: 3.4, haze: [0.56, 0.62, 0.7, 0.42], mist: [0.27, 6, 0.28, 0.4],
        seed: 0.19, lightK: 0,
      },
      {
        kind: 4, width: 600, height: 140, texW: 4096, texH: 1024, base: 0.26, amp: 0.14,
        color: [0.03, 0.045, 0.05], color2: [0.3, 0.34, 0.42], color3: [0.7, 0.75, 0.82],
        p: [5.5, 12, 0.27, 0.6], q: [0.9, 0, 0, 0],
        parallax: 0.09, scale: 2.3, haze: [0.6, 0.66, 0.74, 0.4], mist: [0.26, 6, 0.2, 0.4],
        seed: 0.43, lightK: 0,
      },
      {
        kind: 4, width: 500, height: 110, texW: 4096, texH: 1024, base: 0.24, amp: 0.12,
        color: [0.022, 0.036, 0.04], color2: [0.34, 0.38, 0.46], color3: [0.78, 0.83, 0.9],
        p: [7, 18, 0.3, 0.7], q: [0.85, 0, 0, 0],
        parallax: 0.2, scale: 1.7, haze: [0.6, 0.66, 0.74, 0.22], mist: [0.24, 6, 0.12, 0.4],
        seed: 0.67, lightK: 0,
      },
      {
        kind: 4, width: 400, height: 100, texW: 4096, texH: 1024, base: 0.2, amp: 0.12,
        color: [0.014, 0.024, 0.028], color2: [0.3, 0.34, 0.42], color3: [0.85, 0.9, 0.96],
        p: [15, 28, 0.3, 0.85], q: [0.75, 0, 0, 0],
        parallax: 0.4, scale: 1.2, haze: [0.6, 0.66, 0.74, 0.07], mist: [0.2, 6, 0.04, 0.3],
        seed: 0.83, lightK: 0,
      },
    ],
    ground_: {
      top: [0.78, 0.82, 0.9, 0.85],
      soil: [0.2, 0.15, 0.105, 1.2],
      deep: [0.24, 0.19, 0.15, 0.3],
      rock: [0.26, 0.26, 0.27, 0.7],
      grass: [0.2, 0.2, 0.15, 0],
      mat: [2, 0.2, 0.25, 0.5],
      mat2: [0.9, 0, 0.6, 0],
      acc: [0.5, 0.58, 0.68],
      acc2: [0.6, 0.65, 0.72],
    },
    grade: { exposure: 1.0, bloom: 0.3, saturation: 0.85, contrast: 1.06, vignette: 0.42, warmth: -0.12, grain: 0.03, lift: [0.012, 0.015, 0.022], gain: [0.97, 1.0, 1.06] },
    bloomThreshold: 1.5,
    profile(seed) {
      const f = fbm1(seed, 5);
      const g = fbm1(seed + 7, 3);
      return (x) => 36 + 14 * f(x / 60) + 5 * g(x / 15) + 17 * gauss(x, 160, 34) - 8 * gauss(x, 103, 15) + 6 * gauss(x, 250, 22);
    },
    sculpt(t) {
      markSurface(t);
      // a frozen stream bed in the valley and a cave in the ridge
      const x0 = 96;
      const x1 = 111;
      for (let x = x0; x <= x1; x += 1) t.carve(x, t.top(x) + 0.4, 2.6);
      cave(t, 138, 160, t.top(132) + 2.4, 3.0);
    },
  },

  // ------------------------------------------------------------------ Old Town
  ruins: {
    id: 'ruins',
    name: 'Old Town',
    blurb: 'A bombed city at dusk, in the rain. Burning windows, rubble mounds and cellars to shell.',
    seed: 53,
    ambience: 'city',
    weather: 'rain',
    enemySkin: 'grey',
    sun: [...norm(0.75, 0.16, 0.5), 0.12],
    sunCol: [1.25, 0.82, 0.55, 1],
    sky: [0.22, 0.23, 0.3, 1],
    ground: [0.14, 0.11, 0.1, 1],
    fog: [0.4, 0.28, 0.24, 0.005],
    zenith: [0.05, 0.08, 0.17],
    horizon: [0.8, 0.4, 0.2],
    sunGlow: [1.1, 0.5, 0.2],
    sunPos: [0.95, 0.1],
    cloud: [0.85, 0.75, 0.005, 1.1],
    cloudCol: [0.22, 0.17, 0.17],
    skyA: [0, 0, 0.55, 0.9],
    skyB: [0, 1, 0, 0],
    stars: 0,
    layers: [
      {
        kind: 2, width: 600, height: 200, texW: 4096, texH: 1024, base: 0.3, amp: 0.38,
        color: [0.05, 0.055, 0.075], color2: [0.1, 0.11, 0.14], color3: [0.28, 0.2, 0.2], color4: [0.13, 0.065, 0.05], lit: [1, 0.68, 0.3],
        p: [46, 0, 0, 0], q: [0.05, 0.02, 0, 0.55],
        parallax: 0.04, scale: 3.0, haze: [0.55, 0.36, 0.34, 0.45], mist: [0.3, 6, 0.3, 0.4], emit: [1.1, 0.3, 0, 0],
        seed: 0.21, lightK: 0,
        smoke: [[90, 150, 6, 0.4], [300, 170, 7, 0.45], [500, 140, 6, 0.35]], smokeCol: [0.06, 0.05, 0.055], smokeOp: 0.8, smokeBase: 0.28,
      },
      {
        kind: 2, width: 600, height: 160, texW: 4096, texH: 1024, base: 0.28, amp: 0.34,
        color: [0.05, 0.055, 0.072], color2: [0.11, 0.115, 0.14], color3: [0.28, 0.2, 0.2], color4: [0.14, 0.07, 0.055], lit: [1, 0.7, 0.32],
        p: [34, 0, 0, 0], q: [0.06, 0.025, 0, 0.65],
        parallax: 0.13, scale: 2.1, haze: [0.48, 0.3, 0.28, 0.3], mist: [0.28, 6, 0.2, 0.4], emit: [1.1, 0.3, 0, 0],
        seed: 0.45, lightK: 0.01,
        smoke: [[210, 110, 5, 0.35], [450, 120, 5, 0.4]], smokeCol: [0.06, 0.05, 0.05], smokeOp: 0.75, smokeBase: 0.27,
      },
      {
        kind: 2, width: 400, height: 100, texW: 4096, texH: 1024, base: 0.2, amp: 0.4,
        color: [0.04, 0.042, 0.055], color2: [0.1, 0.095, 0.1], color3: [0.25, 0.18, 0.17], color4: [0.15, 0.07, 0.05], lit: [1, 0.72, 0.34],
        p: [24, 0, 0, 0], q: [0.07, 0.03, 0, 0.85],
        parallax: 0.34, scale: 1.3, haze: [0.42, 0.27, 0.24, 0.1], mist: [0.2, 7, 0.05, 0.5], emit: [1.1, 0.35, 0, 0],
        seed: 0.69, lightK: 0.05,
      },
    ],
    ground_: {
      top: [0.075, 0.077, 0.085, 0.35],
      soil: [0.1, 0.092, 0.082, 3.0],
      deep: [0.17, 0.135, 0.11, 0.3],
      rock: [0.05, 0.047, 0.044, 0.5],
      grass: [0.12, 0.1, 0.05, 0],
      mat: [3, 0.6, 0.25, 0.9],
      mat2: [0, 0, 0.5, 0],
      acc: [0.26, 0.095, 0.07],
      acc2: [0.25, 0.24, 0.23],
    },
    grade: { exposure: 1.1, bloom: 0.7, saturation: 0.9, contrast: 1.12, vignette: 0.5, warmth: 0.25, grain: 0.035, lift: [0.012, 0.01, 0.018], gain: [1.02, 0.97, 0.95] },
    bloomThreshold: 0.9,
    profile(seed) {
      const f = fbm1(seed, 5);
      const g = fbm1(seed + 7, 4);
      const r = rng(seed + 3);
      // street blocks at slightly different levels, with rubble on top
      const blocks = [];
      let x = 0;
      while (x < 340) {
        const w = 28 + r() * 26;
        blocks.push([x, x + w, (r() - 0.5) * 9]);
        x += w;
      }
      const lvl = (px) => {
        let v = 0;
        for (const [a, b, d] of blocks) v += d * sstep(a - 3, a + 3, px) * (1 - sstep(b - 3, b + 3, px)) ;
        // continuous: use the block value around px
        return v;
      };
      return (px) => 33 + lvl(px) + 5 * f(px / 70) + 1.8 * g(px / 7) + 13 * gauss(px, 165, 24) * (0.7 + 0.5 * g(px / 5));
    },
    sculpt(t) {
      markSurface(t);
      // a cellar and a metro tunnel under the rubble mound
      pit(t, 96, 108, t.top(102) - 9, t.top(102) - 1);
      cave(t, 142, 186, t.top(150) - 5.5, 2.8, 1.8);
    },
  },

  // ------------------------------------------------------------------ Black Ridge
  nightfall: {
    id: 'nightfall',
    name: 'Black Ridge',
    blurb: 'A basalt ridge under the moon. Cold light, distant fires and flares on the horizon.',
    seed: 71,
    ambience: 'night',
    weather: 'none',
    enemySkin: 'rust',
    sun: [...norm(-0.5, 0.55, 0.62), 0.6],
    sunCol: [0.66, 0.8, 1.15, 1],
    sky: [0.09, 0.11, 0.18, 1],
    ground: [0.05, 0.055, 0.08, 1],
    fog: [0.06, 0.09, 0.16, 0.004],
    zenith: [0.006, 0.014, 0.045],
    horizon: [0.07, 0.11, 0.22],
    sunGlow: [0.22, 0.32, 0.55],
    sunPos: [-0.6, 0.55],
    cloud: [0.22, 0.6, 0.003, 1.0],
    cloudCol: [0.1, 0.13, 0.22],
    skyA: [0.055, 1, 0, 0.2],
    skyB: [0.3, 1.2, 1, 0],
    stars: 1,
    layers: [
      {
        kind: 0, width: 600, height: 300, texW: 2048, texH: 1024, base: 0.26, amp: 0.32,
        color: [0.02, 0.03, 0.055], color2: [0.09, 0.13, 0.23], color3: [0.2, 0.25, 0.35], color4: [0.01, 0.014, 0.025],
        p: [0, 0.8, 0, 0.9], q: [0.25, 0, 0, 0], lit: [1, 0.5, 0.15], light: 0.5,
        parallax: 0.03, scale: 3.4, haze: [0.07, 0.1, 0.2, 0.4], mist: [0.26, 6, 0.3, 0.4], emit: [2.6, 0.5, 0, 0],
        seed: 0.17, lightK: 0, fire: [45, 0.25, 0.06, 13],
        smoke: [[150, 150, 6, 0.3], [420, 170, 7, 0.4]], smokeCol: [0.02, 0.025, 0.04], smokeOp: 0.7, smokeBase: 0.2,
      },
      {
        kind: 0, width: 600, height: 200, texW: 4096, texH: 1024, base: 0.3, amp: 0.2,
        color: [0.016, 0.024, 0.045], color2: [0.08, 0.115, 0.2], color3: [0.2, 0.25, 0.35], color4: [0.01, 0.014, 0.025],
        p: [0, 1, 0, 1], q: [0.15, 0, 0, 0], lit: [1, 0.5, 0.15], light: 0.5,
        parallax: 0.12, scale: 2.1, haze: [0.07, 0.1, 0.2, 0.24], mist: [0.3, 6, 0.18, 0.4], emit: [2.6, 0.5, 0, 0],
        seed: 0.49, lightK: 0, fire: [38, 0.22, 0.05, 10],
        smoke: [[260, 110, 5, 0.3]], smokeCol: [0.02, 0.024, 0.036], smokeOp: 0.7, smokeBase: 0.28,
      },
      {
        kind: 0, width: 400, height: 100, texW: 4096, texH: 1024, base: 0.2, amp: 0.34,
        color: [0.012, 0.018, 0.034], color2: [0.065, 0.095, 0.17], color3: [0.2, 0.25, 0.35], color4: [0.01, 0.014, 0.025],
        p: [0, 1, 0, 1], q: [0.2, 0, 0, 0], lit: [1, 0.5, 0.15], light: 0.6,
        parallax: 0.32, scale: 1.35, haze: [0.07, 0.1, 0.2, 0.08], mist: [0.2, 7, 0.06, 0.5], emit: [2.6, 0.5, 0, 0],
        seed: 0.83, lightK: 0.03,
      },
    ],
    ground_: {
      top: [0.1, 0.105, 0.12, 0.22],
      soil: [0.07, 0.07, 0.085, 0.5],
      deep: [0.08, 0.082, 0.1, 0.5],
      rock: [0.058, 0.06, 0.078, 0.9],
      grass: [0.06, 0.07, 0.05, 0],
      mat: [4, 0.1, 0.9, 0.35],
      mat2: [0.55, 0.9, 1.0, 0],
      acc: [0.12, 0.07, 0.05],
      acc2: [0.07, 0.09, 0.08],
    },
    grade: { exposure: 1.55, bloom: 0.8, saturation: 0.7, contrast: 1.1, vignette: 0.55, warmth: -0.25, grain: 0.035, lift: [0.01, 0.012, 0.022], gain: [0.97, 1.0, 1.07] },
    bloomThreshold: 0.9,
    profile(seed) {
      const f = fbm1(seed, 5);
      const g = fbm1(seed + 7, 4);
      const crag = fbm1(seed + 13, 3);
      return (x) => {
        // a lower shelf on the left, a sharp basalt spine in the middle, a high plateau on the right
        const spine = 36 * Math.pow(Math.max(0, 1 - Math.abs(x - 163) / 40), 1.5);
        const pl = plateau(x, 262, 55, 22, 11);
        return 30 + 8 * f(x / 55) + 4 * g(x / 13) + 5 * Math.abs(crag(x / 9) - 0.5) * 2 + spine + pl - 6 * gauss(x, 96, 16);
      };
    },
    sculpt(t) {
      markSurface(t);
      // an overhanging ledge on the spine's left face
      const y = t.top(140) - 3;
      for (let x = 146; x >= 136; x -= 1) t.fill(x, y + (146 - x) * 0.05, 2.2);
      cave(t, 126, 150, t.top(122) + 2.5, 2.8);
    },
  },
};

export const BATTLEFIELD_IDS = Object.keys(BATTLEFIELDS);

const MIST0 = [0, 6, 0, 0];
const NOEMIT = [0, 0, 0, 0];

// Fills out the per-layer anchors so each layer's ground line sits just
// behind the battlefield's own ground at the usual camera height, and gives
// every look field a default.
export function prepare(bf) {
  for (const L of bf.layers) {
    const cy0 = 45;
    const H0 = 40;
    L.anchorY = L.base * L.height - cy0 * L.parallax - (H0 - cy0) * L.scale + (L.drop || 0) * L.scale;
    L.mist ??= [L.base, ...MIST0.slice(1)];
    L.emit ??= NOEMIT;
  }
  const g = bf.ground_;
  g.mat ??= [0, 0, 0.2, 0];
  g.mat2 ??= [0.8, 0.6, 0.5, 1];
  g.acc ??= [0.2, 0.17, 0.12];
  g.acc2 ??= [0.15, 0.12, 0.08];
  return bf;
}

export { clamp };
