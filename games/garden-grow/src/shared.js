// Things every part of the garden shares: one breeze (so grass, stems,
// petals and wings all move together), and small helpers for textures
// painted in code.
import * as THREE from 'three';

// ------------------------------------------------------------ the breeze

// Shader uniforms for the breeze. Add them to any foliage material's
// uniforms (Object.assign(shader.uniforms, wind)) and use WIND_GLSL.
// main.js advances uTime and eases uStrength (calmer at bedtime, livelier
// in rain).
export const wind = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.92, -0.38).normalize() },
  uWindStrength: { value: 1 },
};

// windSway(worldPos, flex) returns a horizontal offset in metres (x, z) for a
// point at world position `wp`. `flex` is how bendy that point is: 0 at a
// root, about 1 at the tip of a 40 cm stem (scale with height squared).
export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
float ggHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ggNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ggHash(i), ggHash(i + vec2(1.0, 0.0)), u.x), mix(ggHash(i + vec2(0.0, 1.0)), ggHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec2 windSway(vec3 wp, float flex) {
  vec2 d = uWindDir;
  float gust = ggNoise(wp.xz * 0.45 - d * uTime * 0.55);
  float lean = 0.018 + 0.05 * gust * gust;
  float flutter = sin(uTime * 2.1 + dot(wp.xz, vec2(3.1, 2.7))) * 0.6 + sin(uTime * 3.3 + wp.x * 5.3 - wp.z * 4.1) * 0.4;
  vec2 side = vec2(-d.y, d.x);
  return (d * (lean + flutter * 0.006) + side * flutter * 0.005) * flex * uWindStrength;
}
`;

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// The same sway on the CPU, for plants and creatures animated in JavaScript.
// Writes into `out` (a THREE.Vector2: x, z offsets in metres).
export function windSway(x, y, z, flex, out = new THREE.Vector2()) {
  const t = wind.uTime.value;
  const d = wind.uWindDir.value;
  const gust = noise2(x * 0.45 - d.x * t * 0.55, z * 0.45 - d.y * t * 0.55);
  const lean = 0.018 + 0.05 * gust * gust;
  const flutter = Math.sin(t * 2.1 + x * 3.1 + z * 2.7) * 0.6 + Math.sin(t * 3.3 + x * 5.3 - z * 4.1) * 0.4;
  const k = flex * wind.uWindStrength.value;
  out.set((d.x * (lean + flutter * 0.006) - d.y * flutter * 0.005) * k, (d.y * (lean + flutter * 0.006) + d.x * flutter * 0.005) * k);
  return out;
}

// ------------------------------------------------------------ painted textures

// Value noise and fractal noise in JavaScript, for painting canvases.
export { noise2 };
export function fbm(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * f, y * f);
    f *= lacunarity;
    amp *= gain;
  }
  return sum;
}

// Paints a texture on a canvas. `draw(ctx, w, h)` does the painting.
// Colour maps should pass { srgb: true }; data maps (normal, roughness)
// leave it false.
export function canvasTexture(w, h, draw, { srgb = false, repeat = true, anisotropy = 4, mipmaps = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = mipmaps;
  tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return tex;
}

// Builds a tangent-space normal map from a height function h(u, v) in 0..1
// (u, v in 0..1), sampled on a w x h grid. `strength` scales the bumps.
export function normalMapFromHeight(w, h, height, strength = 2) {
  const hs = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hs[y * w + x] = height(x / w, y / h);
  return canvasTexture(w, h, (ctx) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = hs[y * w + ((x - 1 + w) % w)];
        const r = hs[y * w + ((x + 1) % w)];
        const u = hs[((y - 1 + h) % h) * w + x];
        const d = hs[((y + 1) % h) * w + x];
        let nx = (l - r) * strength;
        let ny = (d - u) * strength;
        let nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        nz /= len;
        const i = (y * w + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}
