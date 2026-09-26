// Procedural textures, baked on the GPU once at start-up: tileable water
// ripple normals (a sum of many small wind waves), a caustic web, and a
// general-purpose noise texture. Nothing is loaded from disk.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Render a fragment shader into a square, tileable, mipmapped texture.
export function bake(renderer, size, fragmentShader, { type = THREE.HalfFloatType, uniforms = {}, mipmaps = true } = {}) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type,
    depthBuffer: false,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    magFilter: THREE.LinearFilter,
    minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    generateMipmaps: mipmaps,
    anisotropy: 4,
  });
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(quad, cam);
  renderer.setRenderTarget(prev);
  mat.dispose();
  quad.geometry.dispose();
  return rt.texture;
}

// GLSL helpers shared by the bakes: an integer hash and tileable noises.
export const HASH_GLSL = /* glsl */ `
uint hashU(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float hash1(uvec2 p) { return float(hashU(p.x * 1597u + hashU(p.y + 7919u))) / 4294967295.0; }
vec2 hash2(uvec2 p) { uint h = hashU(p.x * 1597u + hashU(p.y + 7919u)); return vec2(float(h & 0xffffu), float(h >> 16)) / 65535.0; }
// tileable value noise with integer period
float vnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, period);
  vec2 b = mod(i + 1.0, period);
  float n00 = hash1(uvec2(a));
  float n10 = hash1(uvec2(b.x, a.y));
  float n01 = hash1(uvec2(a.x, b.y));
  float n11 = hash1(uvec2(b));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}
float fbmT(vec2 uv, float period, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += vnoise(uv * period, period) * a;
    n += a;
    a *= 0.5;
    period *= 2.0;
  }
  return s / n;
}
// tileable Worley: x = nearest distance, y = second nearest
vec2 worley(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 c = mod(i + o, period);
    vec2 pt = o + hash2(uvec2(c) + uvec2(11u, 37u));
    float d = length(pt - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2);
}
`;

// Wind ripples: many small wave trains with integer wave numbers (so the
// tile repeats seamlessly), directions spread around the wind, amplitudes
// following a gentle spectrum. Stored as the surface slope (dh/dx, dh/dz) in
// rg and the height in b; one tile stands for `tileMetres` of water.
const RIPPLE_FRAG = /* glsl */ `
${HASH_GLSL}
varying vec2 vUv;
void main() {
  vec2 s = vec2(0.0);
  float h = 0.0;
  const float TAU = 6.2831853;
  for (int i = 0; i < 128; i++) {
    // directions spread around the wind (+x), a few cross waves; wave
    // numbers (cycles per tile) from 6 to 52 so no few long waves dominate
    // and the integer rounding does not line them up into a grid
    float ang = (hash1(uvec2(i, 3)) - 0.5) * 2.2 + (hash1(uvec2(i, 5)) > 0.88 ? 1.4 : 0.0);
    float kf = 6.0 + pow(hash1(uvec2(i, 9)), 1.3) * 46.0;
    vec2 k = floor(vec2(cos(ang), sin(ang)) * kf + 0.5);
    if (k == vec2(0.0)) k = vec2(6.0, 1.0);
    float kl = length(k);
    float amp = 1.0 / pow(kl, 1.25);
    float ph = hash1(uvec2(i, 17)) * TAU;
    float a = dot(k, vUv) * TAU + ph;
    h += sin(a) * amp;
    s += cos(a) * amp * k;
  }
  // slopes for a tile of 1 unit, scaled to a pleasant range
  gl_FragColor = vec4(s * 0.022, h * 0.35, 1.0);
}`;

// A caustic web: bright thin lines where light focuses, from the gap
// between the nearest and second-nearest cell points.
const CAUSTIC_FRAG = /* glsl */ `
${HASH_GLSL}
varying vec2 vUv;
void main() {
  vec2 w = worley(vUv * 7.0, 7.0);
  float c = 1.0 - smoothstep(0.0, 0.16, w.y - w.x);
  vec2 w2 = worley(vUv * 13.0 + 0.37, 13.0);
  float c2 = 1.0 - smoothstep(0.0, 0.12, w2.y - w2.x);
  float v = pow(c, 1.6) * 0.8 + pow(c2, 2.0) * 0.35;
  gl_FragColor = vec4(v, c, c2, 1.0);
}`;

// General noise: r = low-frequency fbm, g = mid fbm, b = fine fbm,
// a = cellular (puffy) noise.
const NOISE_FRAG = /* glsl */ `
${HASH_GLSL}
varying vec2 vUv;
void main() {
  float r = fbmT(vUv, 4.0, 6);
  float g = fbmT(vUv + 0.31, 12.0, 5);
  float b = fbmT(vUv + 0.73, 48.0, 4);
  vec2 w = worley(vUv * 16.0, 16.0);
  gl_FragColor = vec4(r, g, b, 1.0 - w.x);
}`;

export function makeTextures(renderer, quality) {
  const size = quality.texSize;
  return {
    ripples: bake(renderer, size, RIPPLE_FRAG),
    caustics: bake(renderer, 512, CAUSTIC_FRAG),
    noise: bake(renderer, size, NOISE_FRAG),
  };
}
