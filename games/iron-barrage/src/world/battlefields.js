// The battlefields: light, sky, backdrop layers, ground materials, weather,
// the film grade and the shape of the land. Colours are linear.
import { rng, clamp } from '../config.js';

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

export const BATTLEFIELDS = {
  ashfield: {
    id: 'ashfield',
    name: 'Ashfield',
    blurb: 'Burnt farmland at dawn. Rolling fields, a ridge in the middle and smoke on the horizon.',
    seed: 11,
    ambience: 'farm',
    weather: 'ash',
    sun: [...norm(-0.7, 0.42, 0.45), 0.3],
    sunCol: [2.3, 1.45, 0.82, 1],
    sky: [0.3, 0.33, 0.42, 1],
    ground: [0.17, 0.12, 0.08, 1],
    fog: [0.62, 0.5, 0.42, 0.004],
    zenith: [0.16, 0.22, 0.36],
    horizon: [0.95, 0.62, 0.42],
    sunGlow: [1.6, 0.85, 0.42],
    sunPos: [-1.05, -0.05],
    cloud: [0.55, 0.55, 0.004, 1.2],
    cloudCol: [0.62, 0.5, 0.48],
    stars: 0,
    layers: [
      { kind: 0, width: 600, height: 300, texW: 2048, texH: 1024, base: 0.27, amp: 0.3, color: [0.05, 0.06, 0.085], color2: [0.26, 0.27, 0.33], parallax: 0.03, scale: 3.4, haze: [0.46, 0.4, 0.42, 0.42], seed: 0.13, lightK: 0 },
      { kind: 1, width: 600, height: 160, texW: 4096, texH: 1024, base: 0.32, amp: 0.2, color: [0.04, 0.04, 0.038], color2: [0.03, 0.036, 0.026], parallax: 0.12, scale: 2.1, haze: [0.48, 0.36, 0.32, 0.36], seed: 0.37, lightK: 0.01 },
      { kind: 1, width: 400, height: 90, texW: 4096, texH: 1024, base: 0.2, amp: 0.12, color: [0.03, 0.027, 0.022], color2: [0.022, 0.028, 0.018], parallax: 0.32, scale: 1.35, haze: [0.42, 0.32, 0.28, 0.24], seed: 0.61, lightK: 0.04 },
    ],
    ground_: {
      top: [0.075, 0.065, 0.03, 0.25],
      soil: [0.038, 0.031, 0.024, 1.0],
      deep: [0.075, 0.068, 0.06, 0.5],
      rock: [0.09, 0.088, 0.085, 0.7],
      grass: [0.12, 0.11, 0.045, 0.7],
    },
    grade: { exposure: 1.0, bloom: 0.5, saturation: 0.88, contrast: 1.08, vignette: 0.42, warmth: 0.6, grain: 0.035, lift: [0.015, 0.012, 0.02], gain: [1.0, 0.98, 0.94] },
    bloomThreshold: 1.0,
    profile(seed) {
      const f = fbm1(seed, 5);
      const g = fbm1(seed + 7, 3);
      let h = (x) => 30 + 16 * f(x / 55) + 5 * g(x / 14) + 17 * Math.exp(-(((x - 165) / 38) ** 2)) - 6 * Math.exp(-(((x - 105) / 20) ** 2));
      return h;
    },
  },
};

export const BATTLEFIELD_IDS = Object.keys(BATTLEFIELDS);

// Fills out the per-layer anchors so each layer's ground line sits just
// behind the battlefield's own ground at the usual camera height.
export function prepare(bf) {
  for (const L of bf.layers) {
    const cy0 = 45;
    const H0 = 40;
    L.anchorY = L.base * L.height - cy0 * L.parallax - (H0 - cy0) * L.scale;
  }
  return bf;
}

export { clamp };
